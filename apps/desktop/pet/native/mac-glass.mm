// Public AppKit only. Chromium remains a sibling above the material: glyphs and
// controls never enter NSGlassEffectView's content-compositing subtree.
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <MetalKit/MetalKit.h>
#import <simd/simd.h>
#import <objc/runtime.h>
#include <node_api.h>
#include <cstring>
#include <utility>
#include <initializer_list>
#include <string>

static char surfaceKey;
static id<MTLDevice> opticsDevice;
static id<MTLCommandQueue> opticsQueue;
static id<MTLRenderPipelineState> opticsPipeline;

struct GlassUniforms {
  vector_float4 viewport, rect, material, light, backdrop;
};

// Same production shader/uniforms as the Swift prototype. Paused MTKView: no
// animation loop, desktop capture, or screen recording permission.
@interface MoonlightOpticalRim : MTKView <MTKViewDelegate>
@property CGFloat radius;
@property NSUInteger framesDrawn;
@property(strong) NSTrackingArea *pointerArea;
@property vector_float2 pointer;
@end

@implementation MoonlightOpticalRim
- (instancetype)initWithFrame:(NSRect)frame {
  if ((self = [super initWithFrame:frame device:opticsDevice])) {
    self.colorPixelFormat = MTLPixelFormatBGRA8Unorm;
    self.clearColor = MTLClearColorMake(0, 0, 0, 0);
    self.layer.opaque = NO;
    self.paused = YES;
    self.enableSetNeedsDisplay = YES;
    self.autoResizeDrawable = YES;
    self.delegate = self;
    self.accessibilityElement = NO;
  }
  return self;
}
- (BOOL)isOpaque { return NO; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)updateTrackingAreas {
  [super updateTrackingAreas];
  if (_pointerArea) [self removeTrackingArea:_pointerArea];
  _pointerArea = [[NSTrackingArea alloc] initWithRect:NSZeroRect
    options:NSTrackingMouseMoved | NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect
    owner:self userInfo:nil];
  [self addTrackingArea:_pointerArea];
}
- (void)mouseMoved:(NSEvent *)event {
  if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) return;
  NSPoint p = [self convertPoint:event.locationInWindow fromView:nil];
  _pointer = (vector_float2){(float)(p.x / MAX(1, self.bounds.size.width) - .5), (float)(.5 - p.y / MAX(1, self.bounds.size.height))};
  self.needsDisplay = YES;
}
- (void)mouseExited:(NSEvent *)event { _pointer = (vector_float2){0, 0}; self.needsDisplay = YES; }
- (void)mtkView:(MTKView *)view drawableSizeWillChange:(CGSize)size { self.needsDisplay = YES; }
- (void)drawInMTKView:(MTKView *)view {
  if (self.hidden || self.bounds.size.width <= 0 || self.bounds.size.height <= 0) return;
  id<CAMetalDrawable> drawable = self.currentDrawable;
  MTLRenderPassDescriptor *pass = self.currentRenderPassDescriptor;
  id<MTLCommandBuffer> command = [opticsQueue commandBuffer];
  if (!drawable || !pass || !command) return;
  float width = self.bounds.size.width, height = self.bounds.size.height;
  GlassUniforms uniforms = {
    {width, height, (float)(self.drawableSize.width / width), 0},
    {0, 0, width, height}, {(float)_radius, 9, 1, 0},
    {_pointer.x, _pointer.y, 0, .72}, {0, 0, 1, 1}
  };
  id<MTLRenderCommandEncoder> encoder = [command renderCommandEncoderWithDescriptor:pass];
  if (!encoder) return;
  [encoder setRenderPipelineState:opticsPipeline];
  [encoder setFragmentBytes:&uniforms length:sizeof(uniforms) atIndex:0];
  [encoder drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:3];
  [encoder endEncoding];
  [command presentDrawable:drawable];
  [command commit];
  _framesDrawn++;
}
@end

static NSImage *readingMask(CGFloat radius, CGFloat feather) {
  const CGFloat cap = radius + feather, diameter = cap * 2 + 1;
  NSImage *image = [NSImage imageWithSize:NSMakeSize(diameter, diameter) flipped:NO drawingHandler:^BOOL(NSRect rect) {
    CGContextRef ctx = NSGraphicsContext.currentContext.CGContext;
    CGContextSetBlendMode(ctx, kCGBlendModeCopy);
    for (int step = 0; step <= 32; ++step) {
      CGFloat t = step / 32.0, inset = feather * t;
      [[NSColor colorWithWhite:1 alpha:t * t * (3 - 2 * t)] setFill];
      [[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(rect, inset, inset)
        xRadius:MAX(0, radius - inset) yRadius:MAX(0, radius - inset)] fill];
    }
    return YES;
  }];
  image.capInsets = NSEdgeInsetsMake(cap, cap, cap, cap);
  image.resizingMode = NSImageResizingModeStretch;
  return image;
}

API_AVAILABLE(macos(26.0))
@interface MoonlightGlassSurface : NSView
@property(strong) NSGlassEffectView *glass;
@property(strong) NSVisualEffectView *diffusion;
@property(strong) MoonlightOpticalRim *rim;
@property(strong) CALayer *edgeMask;
@property(nonatomic) BOOL solid;
@property CGFloat radius;
- (instancetype)initWithFrame:(NSRect)frame radius:(CGFloat)radius;
@end

@implementation MoonlightGlassSurface
- (instancetype)initWithFrame:(NSRect)frame radius:(CGFloat)radius {
  if ((self = [super initWithFrame:frame])) {
    _radius = radius;
    self.wantsLayer = YES;
    self.layer.cornerRadius = radius;
    self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.accessibilityElement = NO;
    // Match the latest native reference (97794923), including its feathered
    // 28% diffusion. Do not place a full-window HUD/opaque veil under clear glass.
    _diffusion = [[NSVisualEffectView alloc] initWithFrame:self.bounds];
    _diffusion.material = NSVisualEffectMaterialUnderWindowBackground;
    _diffusion.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    _diffusion.state = NSVisualEffectStateActive;
    _diffusion.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    _diffusion.alphaValue = 0.28;
    _diffusion.maskImage = readingMask(radius, 24);
    [self addSubview:_diffusion];
    _glass = [[NSGlassEffectView alloc] initWithFrame:self.bounds];
    _glass.style = NSGlassEffectViewStyleClear;
    _glass.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    _glass.cornerRadius = radius;
    _glass.contentView = [[NSView alloc] initWithFrame:NSZeroRect];
    [self addSubview:_glass];
    if (opticsPipeline) {
      _rim = [[MoonlightOpticalRim alloc] initWithFrame:self.bounds];
      _rim.radius = radius;
      [self addSubview:_rim];
      // The original masks the native bevel's outer 8pt so the Metal lip owns
      // the reflection, with a fully transparent content-bearing center.
      _edgeMask = [CALayer layer];
      NSImage *image = readingMask(radius, 8);
      _edgeMask.contents = (__bridge id)[image CGImageForProposedRect:nil context:nil hints:nil];
      CGFloat cap = radius + 8, diameter = cap * 2 + 1;
      _edgeMask.contentsCenter = CGRectMake(cap / diameter, cap / diameter, 1 / diameter, 1 / diameter);
      _glass.wantsLayer = YES;
      _glass.layer.mask = _edgeMask;
    }
    [self setSolid:NO];
  }
  return self;
}
- (BOOL)isOpaque { return NO; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)layout {
  [super layout];
  _glass.frame = self.bounds;
  _diffusion.frame = self.bounds;
  _rim.frame = self.bounds;
  _rim.needsDisplay = YES;
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  _edgeMask.frame = _glass.bounds;
  [CATransaction commit];
}
- (void)setSolid:(BOOL)solid {
  _solid = solid;
  _glass.hidden = solid;
  _diffusion.hidden = solid;
  _rim.hidden = solid;
  _rim.pointer = (vector_float2){0, 0};
  _rim.needsDisplay = YES;
  self.layer.backgroundColor = (solid
    ? [NSColor colorWithSRGBRed:27/255.0 green:36/255.0 blue:48/255.0 alpha:1]
    : NSColor.clearColor).CGColor;
}
@end

static napi_value boolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

// Only the trusted Electron main process supplies this NSView* handle. Never
// expose this module or native handles through preload/IPC to a renderer.
static NSView *hostView(napi_env env, napi_value value) {
  bool isBuffer = false;
  napi_is_buffer(env, value, &isBuffer);
  if (!isBuffer || !NSThread.isMainThread) return nil;
  void *bytes = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &bytes, &length) != napi_ok || length != sizeof(void *)) return nil;
  void *pointer = nullptr;
  std::memcpy(&pointer, bytes, sizeof(pointer));
  if (!pointer) return nil;
  NSView *view = (__bridge NSView *)pointer;
  return view;
}

static napi_value supported(napi_env env, napi_callback_info info) {
  if (@available(macOS 26.0, *)) return boolean(env, NSThread.isMainThread);
  return boolean(env, false);
}

static napi_value configureOptics(napi_env env, napi_callback_info info) {
  if (!NSThread.isMainThread) return boolean(env, false);
  if (opticsPipeline) return boolean(env, true);
  size_t argc = 1, length = 0;
  napi_value arg;
  napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr);
  if (argc != 1 || napi_get_value_string_utf8(env, arg, nullptr, 0, &length) != napi_ok) return boolean(env, false);
  std::string text(length + 1, '\0');
  napi_get_value_string_utf8(env, arg, text.data(), text.size(), &length);
  opticsDevice = MTLCreateSystemDefaultDevice();
  opticsQueue = [opticsDevice newCommandQueue];
  NSError *error = nil;
  NSString *source = [[NSString alloc] initWithBytes:text.data() length:length encoding:NSUTF8StringEncoding];
  id<MTLLibrary> library = [opticsDevice newLibraryWithSource:source options:nil error:&error];
  MTLRenderPipelineDescriptor *descriptor = [MTLRenderPipelineDescriptor new];
  descriptor.vertexFunction = [library newFunctionWithName:@"glassVertex"];
  descriptor.fragmentFunction = [library newFunctionWithName:@"glassFragment"];
  descriptor.colorAttachments[0].pixelFormat = MTLPixelFormatBGRA8Unorm;
  if (descriptor.vertexFunction && descriptor.fragmentFunction)
    opticsPipeline = [opticsDevice newRenderPipelineStateWithDescriptor:descriptor error:&error];
  if (!opticsPipeline) NSLog(@"Moonlight optical rim unavailable: %@", error.localizedDescription);
  return boolean(env, opticsPipeline && opticsQueue);
}

static napi_value attach(napi_env env, napi_callback_info info) {
  if (@available(macOS 26.0, *)) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc != 2) return boolean(env, false);
    NSView *host = hostView(env, args[0]);
    double radius = 26;
    if (!host || napi_get_value_double(env, args[1], &radius) != napi_ok || radius < 0 || radius > 100) return boolean(env, false);
    MoonlightGlassSurface *surface = objc_getAssociatedObject(host, &surfaceKey);
    if (!surface) {
      surface = [[MoonlightGlassSurface alloc] initWithFrame:host.bounds radius:radius];
      [host addSubview:surface positioned:NSWindowBelow relativeTo:nil];
      // Lifetime follows the window's content view; no global window/view map.
      objc_setAssociatedObject(host, &surfaceKey, surface, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    return boolean(env, surface.superview == host);
  }
  return boolean(env, false);
}

static napi_value setSolid(napi_env env, napi_callback_info info) {
  if (@available(macOS 26.0, *)) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    if (argc != 2) return boolean(env, false);
    NSView *host = hostView(env, args[0]);
    bool solid = false;
    if (!host || napi_get_value_bool(env, args[1], &solid) != napi_ok) return boolean(env, false);
    MoonlightGlassSurface *surface = objc_getAssociatedObject(host, &surfaceKey);
    if (!surface) return boolean(env, false);
    surface.solid = solid;
    return boolean(env, true);
  }
  return boolean(env, false);
}

static napi_value inspect(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_create_object(env, &result);
  if (@available(macOS 26.0, *)) {
    size_t argc = 1;
    napi_value arg;
    napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr);
    NSView *host = argc ? hostView(env, arg) : nil;
    MoonlightGlassSurface *surface = host ? objc_getAssociatedObject(host, &surfaceKey) : nil;
    napi_set_named_property(env, result, "attached", boolean(env, surface && surface.superview == host));
    if (surface) {
      napi_set_named_property(env, result, "solid", boolean(env, surface.solid));
      napi_set_named_property(env, result, "optical", boolean(env, surface.rim != nil));
      for (const auto &entry : {std::pair<const char *, double>{"width", surface.frame.size.width},
           {"height", surface.frame.size.height}, {"radius", surface.radius}, {"frames", (double)surface.rim.framesDrawn}}) {
        napi_value number;
        napi_create_double(env, entry.second, &number);
        napi_set_named_property(env, result, entry.first, number);
      }
    }
  }
  return result;
}

static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
    {"isSupported", nullptr, supported, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"configureOptics", nullptr, configureOptics, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"attach", nullptr, attach, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setSolid", nullptr, setSolid, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"inspect", nullptr, inspect, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
