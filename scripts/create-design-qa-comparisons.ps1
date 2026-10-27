param(
  [string]$PreviewRoot = "output/design-previews",
  [string]$ReferenceRoot = "../../project-intelligence/assets/design-references/selected-2026-08-15"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$qaRoot = Join-Path $PreviewRoot "qa"
New-Item -ItemType Directory -Force -Path $qaRoot | Out-Null

function New-Canvas([int]$width, [int]$height) {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::FromArgb(244, 247, 242))
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-Cover(
  [System.Drawing.Graphics]$graphics,
  [System.Drawing.Image]$image,
  [System.Drawing.Rectangle]$target,
  [int]$sourceHeight = 0
) {
  $usableHeight = if ($sourceHeight -gt 0) { [Math]::Min($sourceHeight, $image.Height) } else { $image.Height }
  $scale = [Math]::Max($target.Width / $image.Width, $target.Height / $usableHeight)
  $sourceWidth = $target.Width / $scale
  $sourceCropHeight = $target.Height / $scale
  $sourceX = [Math]::Max(0, ($image.Width - $sourceWidth) / 2)
  $sourceY = 0
  $source = [System.Drawing.RectangleF]::new($sourceX, $sourceY, $sourceWidth, $sourceCropHeight)
  $destination = [System.Drawing.RectangleF]::new($target.X, $target.Y, $target.Width, $target.Height)
  $graphics.DrawImage($image, $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)
}

function Save-Comparison([string]$referenceFile, [string]$implementationFile, [string]$outputFile) {
  $reference = [System.Drawing.Image]::FromFile((Resolve-Path $referenceFile))
  $implementation = [System.Drawing.Image]::FromFile((Resolve-Path $implementationFile))
  $canvas = New-Canvas 1440 1984
  $font = [System.Drawing.Font]::new("Microsoft YaHei UI", 18, [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(21, 63, 52))
  try {
    $canvas.Graphics.DrawString("视觉目标", $font, $brush, 24, 12)
    Draw-Cover $canvas.Graphics $reference ([System.Drawing.Rectangle]::new(0, 64, 1440, 960))
    $canvas.Graphics.DrawString("本地实现", $font, $brush, 24, 1036)
    Draw-Cover $canvas.Graphics $implementation ([System.Drawing.Rectangle]::new(0, 1088, 1440, 896)) 960
    $canvas.Bitmap.Save($outputFile, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $brush.Dispose()
    $font.Dispose()
    $canvas.Graphics.Dispose()
    $canvas.Bitmap.Dispose()
    $reference.Dispose()
    $implementation.Dispose()
  }
}

function Save-ContactSheet([string]$viewport, [int]$sourceHeight, [int]$columns, [int]$cellWidth, [int]$cellHeight) {
  $files = Get-ChildItem -LiteralPath (Join-Path $PreviewRoot $viewport) -Filter "*.png" | Sort-Object Name
  $labelHeight = 34
  $rows = [Math]::Ceiling($files.Count / $columns)
  $canvas = New-Canvas ($columns * $cellWidth) ($rows * ($cellHeight + $labelHeight))
  $font = [System.Drawing.Font]::new("Microsoft YaHei UI", 10, [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(21, 63, 52))
  try {
    for ($index = 0; $index -lt $files.Count; $index += 1) {
      $column = $index % $columns
      $row = [Math]::Floor($index / $columns)
      $x = $column * $cellWidth
      $y = $row * ($cellHeight + $labelHeight)
      $image = [System.Drawing.Image]::FromFile($files[$index].FullName)
      try {
        Draw-Cover $canvas.Graphics $image ([System.Drawing.Rectangle]::new($x, $y, $cellWidth, $cellHeight)) $sourceHeight
        $canvas.Graphics.DrawString($files[$index].BaseName, $font, $brush, $x + 8, $y + $cellHeight + 7)
      } finally {
        $image.Dispose()
      }
    }
    $canvas.Bitmap.Save((Join-Path $qaRoot "$viewport-contact-sheet.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $brush.Dispose()
    $font.Dispose()
    $canvas.Graphics.Dispose()
    $canvas.Bitmap.Dispose()
  }
}

Save-Comparison (Join-Path $ReferenceRoot "direction-journey-companion.png") (Join-Path $PreviewRoot "desktop/home.png") (Join-Path $qaRoot "journey-reference-vs-home.png")

Save-Comparison (Join-Path $ReferenceRoot "direction-map-first.png") (Join-Path $PreviewRoot "desktop/map.png") (Join-Path $qaRoot "map-reference-vs-implementation.png")

Save-ContactSheet "desktop" 960 5 288 192
Save-ContactSheet "mobile" 844 3 195 422

Write-Output "Design QA comparisons created in $qaRoot"
