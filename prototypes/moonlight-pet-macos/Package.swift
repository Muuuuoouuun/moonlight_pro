// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MoonlightPetPreview",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "MoonlightPetPreview", targets: ["MoonlightPetPreview"])],
    targets: [
        .executableTarget(
            name: "MoonlightPetPreview",
            resources: [.process("Resources"), .copy("Shaders")]
        )
    ]
)
