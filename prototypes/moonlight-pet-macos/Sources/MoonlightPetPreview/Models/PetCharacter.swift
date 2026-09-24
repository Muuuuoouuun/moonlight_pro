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
