import AppKit

enum PetCharacter: String, CaseIterable, Identifiable {
    case brown, silver, blue, red, dark, lilac, gold, pink

    var id: String { rawValue }

    var title: String {
        switch self {
        case .brown: return "브라운"
        case .silver: return "실버"
        case .blue: return "블루"
        case .red: return "레드"
        case .dark: return "다크"
        case .lilac: return "라일락"
        case .gold: return "골드"
        case .pink: return "핑크"
        }
    }

    var imageName: String { "pet-\(rawValue)" }

    var artwork: NSImage? { Self.artworks[self] }

    private static let artworks: [PetCharacter: NSImage] = Dictionary(
        uniqueKeysWithValues: allCases.compactMap { character in
            let fileName = "\(character.imageName).png"
            let packagedURL = Bundle.main.resourceURL?
                .appendingPathComponent("MoonlightPetPreview_MoonlightPetPreview.bundle", isDirectory: true)
                .appendingPathComponent(fileName)
            let url = packagedURL.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil }
                ?? Bundle.module.url(forResource: character.imageName, withExtension: "png")
            guard let url, let image = NSImage(contentsOf: url) else { return nil }
            return (character, image)
        }
    )
}
