// rois-ocr — native macOS screenshot inspection tool (no third-party deps).
//
// Why this exists: the screenshot proof gate in CLAUDE.md §PW-Snapshot requires the
// agent to *inspect* the captured PNG. Agent runtimes that do not accept image input
// (view_image is hard-blocked) cannot satisfy that gate visually. This tool turns a
// PNG into deterministic, machine-checkable text: OCR words with bounding boxes,
// image statistics, and pixel diffs between two captures.
//
// Built on Apple's Vision + CoreGraphics frameworks, so it needs only the macOS
// toolchain that the dev machine already has — nothing to install.
//
// Usage:
//   rois-ocr ocr   <image> [--min-confidence 0.0]
//   rois-ocr stats <image>
//   rois-ocr diff  <imageA> <imageB>
//
// Every command prints a single JSON object on stdout.

import Foundation
import Vision
import AppKit
import CoreGraphics

// MARK: - JSON helpers

func jsonEscape(_ s: String) -> String {
    var out = ""
    out.reserveCapacity(s.count + 8)
    for ch in s.unicodeScalars {
        switch ch {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if ch.value < 0x20 {
                out += String(format: "\\u%04x", ch.value)
            } else {
                out.unicodeScalars.append(ch)
            }
        }
    }
    return out
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    let payload = "{\"ok\":false,\"error\":\"\(jsonEscape(message))\"}"
    print(payload)
    exit(code)
}

func loadCGImage(_ path: String) -> CGImage {
    guard FileManager.default.fileExists(atPath: path) else {
        fail("file not found: \(path)", code: 2)
    }
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fail("cannot decode image: \(path)", code: 3)
    }
    return cg
}

/// Draw an image into a known RGBA8 buffer so pixels can be compared byte-wise.
func rgbaBuffer(_ image: CGImage) -> (buf: [UInt8], width: Int, height: Int) {
    let w = image.width
    let h = image.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    let cs = CGColorSpaceCreateDeviceRGB()
    buf.withUnsafeMutableBytes { raw in
        guard let ctx = CGContext(
            data: raw.baseAddress,
            width: w, height: h,
            bitsPerComponent: 8, bytesPerRow: w * 4,
            space: cs,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    }
    return (buf, w, h)
}

// MARK: - ocr

func runOCR(_ path: String, minConfidence: Float) {
    let cg = loadCGImage(path)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]

    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
        try handler.perform([request])
    } catch {
        fail("vision OCR failed: \(error.localizedDescription)", code: 4)
    }

    let observations = (request.results ?? []).sorted { a, b in
        // Reading order: top-to-bottom, then left-to-right (Vision y origin is bottom-left).
        if abs(a.boundingBox.midY - b.boundingBox.midY) > 0.004 {
            return a.boundingBox.midY > b.boundingBox.midY
        }
        return a.boundingBox.minX < b.boundingBox.minX
    }

    var blocks: [String] = []
    var plain: [String] = []
    for obs in observations {
        guard let cand = obs.topCandidates(1).first else { continue }
        if cand.confidence < minConfidence { continue }
        let bb = obs.boundingBox
        blocks.append(
            "{\"text\":\"\(jsonEscape(cand.string))\","
            + "\"confidence\":\(String(format: "%.4f", cand.confidence)),"
            + "\"box\":{\"x\":\(String(format: "%.5f", bb.minX)),"
            + "\"y\":\(String(format: "%.5f", bb.minY)),"
            + "\"w\":\(String(format: "%.5f", bb.width)),"
            + "\"h\":\(String(format: "%.5f", bb.height))}}"
        )
        plain.append(cand.string)
    }

    let text = jsonEscape(plain.joined(separator: "\n"))
    print(
        "{\"ok\":true,\"image\":{\"path\":\"\(jsonEscape(path))\","
        + "\"width\":\(cg.width),\"height\":\(cg.height)},"
        + "\"blockCount\":\(blocks.count),"
        + "\"text\":\"\(text)\","
        + "\"blocks\":[\(blocks.joined(separator: ","))]}"
    )
}

// MARK: - stats

func runStats(_ path: String) {
    let cg = loadCGImage(path)
    let (buf, w, h) = rgbaBuffer(cg)
    let total = w * h
    guard total > 0 else { fail("zero-sized image", code: 5) }

    var sumR = 0, sumG = 0, sumB = 0
    var colorCounts: [UInt32: Int] = [:]
    var ink = 0
    colorCounts.reserveCapacity(4096)

    for i in stride(from: 0, to: total * 4, by: 4) {
        let r = Int(buf[i]), g = Int(buf[i + 1]), b = Int(buf[i + 2])
        sumR += r; sumG += g; sumB += b
        let key = UInt32(r) << 16 | UInt32(g) << 8 | UInt32(b)
        colorCounts[key, default: 0] += 1
        // "Ink" = pixels that differ noticeably from near-white/near-black chrome.
        let lum = (r * 299 + g * 587 + b * 114) / 1000
        if lum < 235 && lum > 20 { ink += 1 }
    }

    let top = colorCounts.sorted { $0.value > $1.value }.prefix(5).map { entry -> String in
        let r = (entry.key >> 16) & 0xFF, g = (entry.key >> 8) & 0xFF, b = entry.key & 0xFF
        let pct = Double(entry.value) / Double(total) * 100.0
        return "{\"hex\":\"#\(String(format: "%02x%02x%02x", r, g, b))\","
            + "\"pct\":\(String(format: "%.2f", pct))}"
    }

    let meanR = Double(sumR) / Double(total)
    let meanG = Double(sumG) / Double(total)
    let meanB = Double(sumB) / Double(total)
    let meanLum = (meanR * 0.299 + meanG * 0.587 + meanB * 0.114)
    let inkRatio = Double(ink) / Double(total)
    let blank = inkRatio < 0.005 || colorCounts.count < 8

    print(
        "{\"ok\":true,\"image\":{\"path\":\"\(jsonEscape(path))\",\"width\":\(w),\"height\":\(h)},"
        + "\"meanRGB\":[\(String(format: "%.1f", meanR)),\(String(format: "%.1f", meanG)),\(String(format: "%.1f", meanB))],"
        + "\"meanLuminance\":\(String(format: "%.1f", meanLum)),"
        + "\"uniqueColors\":\(colorCounts.count),"
        + "\"inkRatio\":\(String(format: "%.5f", inkRatio)),"
        + "\"blank\":\(blank),"
        + "\"topColors\":[\(top.joined(separator: ","))]}"
    )
}

// MARK: - diff

func runDiff(_ pathA: String, _ pathB: String) {
    let a = loadCGImage(pathA)
    let b = loadCGImage(pathB)
    guard a.width == b.width, a.height == b.height else {
        fail("size mismatch: \(a.width)x\(a.height) vs \(b.width)x\(b.height)", code: 6)
    }
    let w = a.width, h = a.height
    let (bufA, _, _) = rgbaBuffer(a)
    let (bufB, _, _) = rgbaBuffer(b)

    // Tolerance absorbs PNG/antialias noise but still catches real layout changes.
    let threshold = 24
    var changed = 0
    var minX = w, minY = h, maxX = -1, maxY = -1
    let grid = 8
    var cellChanged = [Int](repeating: 0, count: grid * grid)
    var cellTotal = [Int](repeating: 0, count: grid * grid)

    for y in 0..<h {
        let cy = min(grid - 1, y * grid / max(h, 1))
        for x in 0..<w {
            let i = (y * w + x) * 4
            let dr = abs(Int(bufA[i]) - Int(bufB[i]))
            let dg = abs(Int(bufA[i + 1]) - Int(bufB[i + 1]))
            let db = abs(Int(bufA[i + 2]) - Int(bufB[i + 2]))
            let cx = min(grid - 1, x * grid / max(w, 1))
            let ci = cy * grid + cx
            cellTotal[ci] += 1
            if dr + dg + db > threshold * 3 {
                changed += 1
                if x < minX { minX = x }
                if y < minY { minY = y }
                if x > maxX { maxX = x }
                if y > maxY { maxY = y }
                cellChanged[ci] += 1
            }
        }
    }

    let total = w * h
    let ratio = total > 0 ? Double(changed) / Double(total) : 0
    let cells = (0..<(grid * grid)).map { i -> String in
        let pct = cellTotal[i] > 0 ? Double(cellChanged[i]) / Double(cellTotal[i]) * 100.0 : 0
        return String(format: "%.1f", pct)
    }
    let bbox: String
    if maxX < 0 {
        bbox = "null"
    } else {
        bbox = "{\"x\":\(minX),\"y\":\(minY),\"w\":\(maxX - minX + 1),\"h\":\(maxY - minY + 1)}"
    }

    print(
        "{\"ok\":true,\"a\":\"\(jsonEscape(pathA))\",\"b\":\"\(jsonEscape(pathB))\","
        + "\"width\":\(w),\"height\":\(h),"
        + "\"changedPixels\":\(changed),\"changedRatio\":\(String(format: "%.5f", ratio)),"
        + "\"identical\":\(changed == 0),"
        + "\"changedBBox\":\(bbox),"
        + "\"grid\":{\"size\":\(grid),\"changedPct\":[\(cells.joined(separator: ","))]}}"
    )
}

// MARK: - entry point

let args = Array(CommandLine.arguments.dropFirst())
guard let command = args.first else {
    fail("usage: rois-ocr <ocr|stats|diff> <image> [image2]", code: 64)
}

switch command {
case "ocr":
    guard args.count >= 2 else { fail("usage: rois-ocr ocr <image> [--min-confidence N]", code: 64) }
    var minConfidence: Float = 0.0
    if let idx = args.firstIndex(of: "--min-confidence"), idx + 1 < args.count,
       let v = Float(args[idx + 1]) {
        minConfidence = v
    }
    runOCR(args[1], minConfidence: minConfidence)
case "stats":
    guard args.count >= 2 else { fail("usage: rois-ocr stats <image>", code: 64) }
    runStats(args[1])
case "diff":
    guard args.count >= 3 else { fail("usage: rois-ocr diff <imageA> <imageB>", code: 64) }
    runDiff(args[1], args[2])
default:
    fail("unknown command: \(command)", code: 64)
}
