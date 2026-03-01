class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.3.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.3.0/askkaya-darwin-arm64"
      sha256 "31add5203310d4213c877c2ea2fad02eb83a7bf48a3d1ddb7210f54e54085d8d"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.3.0/askkaya-darwin-amd64"
      sha256 "e812e0559e28ba277453551ac88393ccf57917334515719a61175bd3e67f770b"
    end
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "askkaya-darwin-arm64" => "askkaya"
      else
        bin.install "askkaya-darwin-amd64" => "askkaya"
      end
    end
  end

  test do
    system "#{bin}/askkaya", "--version"
  end
end
