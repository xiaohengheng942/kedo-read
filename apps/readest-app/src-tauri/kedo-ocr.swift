import Foundation
import ImageIO
import Vision

let input = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(input as CFData, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fputs("无法读取页面图像。\n", stderr); exit(1)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true
do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    FileHandle.standardOutput.write(Data(text.utf8))
} catch {
    fputs("系统文字识别失败。\n", stderr); exit(1)
}
