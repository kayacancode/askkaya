class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.2.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.1/askkaya-darwin-arm64"
      sha256 "e11f972faf89af457489a1f205f938e741bb4016f546f8bf812258d34d548292"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.1/askkaya-darwin-amd64"
      sha256 "098e97a83cc3d222fa44c03825ea591683e0855e815c58b773cd9bc4dc82a007"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.1/askkaya-linux-arm64"
      sha256 "9802726e3043f790167c04c134b2d4d5779a1ad515ddf835626b1d1a336bf5a8"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.1/askkaya-linux-amd64"
      sha256 "61915b6ef56da7908eff285db963ef300a9ea8c9962d86f452368f0154f70b47"
    end
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "askkaya-darwin-arm64" => "askkaya"
      else
        bin.install "askkaya-darwin-amd64" => "askkaya"
      end
    elsif OS.linux?
      if Hardware::CPU.arm?
        bin.install "askkaya-linux-arm64" => "askkaya"
      else
        bin.install "askkaya-linux-amd64" => "askkaya"
      end
    end
  end

  test do
    system "#{bin}/askkaya", "--version"
  end
end
