import AppKit

enum PetCharacter: String, CaseIterable, Identifiable {
    case brown, blue, gold, red, lilac, dark, olive, silver, pink

    var id: String { rawValue }

    var title: String {
        switch self {
        case .brown: return "이브이"
        case .blue: return "샤미드"
        case .gold: return "쥬피썬더"
        case .red: return "부스터"
        case .lilac: return "에브이"
        case .dark: return "블래키"
        case .olive: return "리피아"
        case .silver: return "글레이시아"
        case .pink: return "님피아"
        }
    }

    var imageName: String { "pet-\(rawValue)" }

    var artwork: NSImage? { Self.artworks[self] }
    var portraitArtwork: NSImage? { Self.portraits[self] }

    private static let portraits: [PetCharacter: NSImage] = Dictionary(uniqueKeysWithValues: allCases.compactMap { character in
        let name = character == .dark ? "pet-dark-straight" : character.imageName
        guard let url = resourceURL(name), let image = NSImage(contentsOf: url) else { return nil }
        return (character, image)
    })

    // Pixel rectangles describe the generated transparent atlases, not business data.
    private var sprite: (name: String, rect: CGRect) {
        switch self {
        case .brown: return ("pet-cutouts-a", CGRect(x: 72, y: 94, width: 389, height: 359))
        case .blue: return ("pet-cutouts-a", CGRect(x: 576, y: 127, width: 409, height: 330))
        case .gold: return ("pet-cutouts-a", CGRect(x: 1070, y: 89, width: 392, height: 365))
        case .red: return ("pet-cutouts-a", CGRect(x: 63, y: 570, width: 398, height: 357))
        case .lilac: return ("pet-cutouts-corrected", CGRect(x: 797, y: 171, width: 727, height: 709))
        case .dark: return ("pet-cutouts-corrected", CGRect(x: 15, y: 161, width: 747, height: 692))
        case .olive: return ("pet-cutouts-b", CGRect(x: 636, y: 57, width: 578, height: 570))
        case .silver: return ("pet-cutouts-b", CGRect(x: 28, y: 633, width: 599, height: 603))
        case .pink: return ("pet-cutouts-b", CGRect(x: 627, y: 627, width: 616, height: 604))
        }
    }

    private static func resourceURL(_ name: String) -> URL? {
        let packaged = Bundle.main.resourceURL?
            .appendingPathComponent("MoonlightPetPreview_MoonlightPetPreview.bundle", isDirectory: true)
            .appendingPathComponent("\(name).png")
        return packaged.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil }
            ?? Bundle.module.url(forResource: name, withExtension: "png")
    }

    private static let artworks: [PetCharacter: NSImage] = {
        let atlases = ["pet-cutouts-a", "pet-cutouts-b", "pet-cutouts-corrected"]
        let images: [String: CGImage] = Dictionary(uniqueKeysWithValues: atlases.compactMap { name in
            guard let url = resourceURL(name), let data = try? Data(contentsOf: url),
                  let bitmap = NSBitmapImageRep(data: data), let image = bitmap.cgImage else { return nil }
            return (name, image)
        })
        return Dictionary(uniqueKeysWithValues: allCases.compactMap { character in
            let sprite = character.sprite
            if let cropped = images[sprite.name]?.cropping(to: sprite.rect) {
                return (character, NSImage(cgImage: cropped,
                                          size: NSSize(width: cropped.width, height: cropped.height)))
            }
            let name = character == .dark ? "pet-dark-straight" : character.imageName
            guard let url = resourceURL(name), let image = NSImage(contentsOf: url) else { return nil }
            return (character, image)
        })
    }()
}
