'use strict';
const path = require('node:path');
const fs = require('node:fs');

// Optional at runtime (older macOS / source checkout without a build). Mac
// packaging runs the compiler first; a missing module must never prevent startup.
function loadMacGlass({ platform = process.platform, load = require, log = () => {} } = {}) {
  if (platform !== 'darwin') return null;
  // Plain Node unit tests have no AppKit application/window lifecycle.
  if (load === require && !process.versions.electron) return null;
  try {
    const bundled = process.resourcesPath && path.join(process.resourcesPath, 'native/mac-glass.node');
    const file = bundled && fs.existsSync(bundled) ? bundled : path.join(__dirname, '../native/build', `mac-glass-${process.arch}.node`);
    const binding = load(file);
    if (!binding.isSupported()) return null;
    try {
      if (binding.configureOptics && !binding.configureOptics(fs.readFileSync(path.join(path.dirname(file), 'GlassOptics.metal'), 'utf8'))) {
        log('pet:mac-glass Metal unavailable; using native rim');
      }
    } catch (error) {
      log(`pet:mac-glass optical resource unavailable; using native rim (${error.message})`);
    }
    return binding;
  } catch (error) {
    log(`pet:mac-glass unavailable; using vibrancy (${error.message})`);
    return null;
  }
}

function attachMacGlass(win, binding, radius, log = () => {}) {
  if (!binding || !win || win.isDestroyed()) return null;
  try {
    const handle = win.getNativeWindowHandle();
    // Electron's HUD must be removed before inserting the clear native backdrop.
    win.setVibrancy(null);
    if (!binding.attach(handle, radius)) return null;
    return {
      setSolid: (solid) => !win.isDestroyed() && binding.setSolid(handle, solid),
      inspect: () => win.isDestroyed() ? { attached: false } : binding.inspect(handle),
    };
  } catch (error) {
    log(`pet:mac-glass attach failed (${error.message})`);
    return null;
  }
}

module.exports = { loadMacGlass, attachMacGlass };
