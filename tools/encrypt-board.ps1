param(
    [string]$SourcePath = (Join-Path (Split-Path $PSScriptRoot -Parent) "board\board-source.json"),
    [string]$OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent) "board\board-content.enc.json"),
    [int]$Iterations = 600000
)

$ErrorActionPreference = "Stop"

if ($Iterations -lt 100000) {
    throw "Iterations must be at least 100000."
}

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "Board source file not found: $SourcePath"
}

$sourceText = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $SourcePath).Path)
$sourceData = $sourceText | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace([string]$sourceData.notionUrl)) {
    throw "board-source.json must contain notionUrl."
}

$notionUri = [Uri]$sourceData.notionUrl
if ($notionUri.Scheme -ne "https" -or -not $notionUri.Host.EndsWith(".notion.site")) {
    throw "notionUrl must be an HTTPS notion.site URL."
}

$securePassword = Read-Host "Board password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$password = $null
$deriveBytes = $null
$aes = $null
$encryptor = $null
$hmac = $null

try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $password = $password.Normalize([Text.NormalizationForm]::FormC)

    if ([string]::IsNullOrWhiteSpace($password)) {
        throw "Password cannot be empty."
    }

    $salt = New-Object byte[] 16
    $iv = New-Object byte[] 16
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($salt)
        $random.GetBytes($iv)
    }
    finally {
        $random.Dispose()
    }

    $deriveBytes = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
        $password,
        $salt,
        $Iterations,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256
    )

    $keyBytes = $deriveBytes.GetBytes(64)
    $encryptionKey = [byte[]]$keyBytes[0..31]
    $authenticationKey = [byte[]]$keyBytes[32..63]

    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.BlockSize = 128
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $encryptionKey
    $aes.IV = $iv

    $plaintextBytes = [Text.Encoding]::UTF8.GetBytes($sourceText)
    $encryptor = $aes.CreateEncryptor()
    $ciphertext = $encryptor.TransformFinalBlock($plaintextBytes, 0, $plaintextBytes.Length)

    $saltBase64 = [Convert]::ToBase64String($salt)
    $ivBase64 = [Convert]::ToBase64String($iv)
    $ciphertextBase64 = [Convert]::ToBase64String($ciphertext)
    $macText = "1.$Iterations.$saltBase64.$ivBase64.$ciphertextBase64"

    $hmac = [System.Security.Cryptography.HMACSHA256]::new($authenticationKey)
    $mac = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($macText))

    $envelope = [ordered]@{
        version = 1
        algorithm = "AES-256-CBC+HMAC-SHA-256"
        kdf = "PBKDF2-SHA-256"
        iterations = $Iterations
        salt = $saltBase64
        iv = $ivBase64
        ciphertext = $ciphertextBase64
        mac = [Convert]::ToBase64String($mac)
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }

    $json = $envelope | ConvertTo-Json
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($OutputPath, $json, $utf8WithoutBom)

    Write-Host "Encrypted board created: $OutputPath"
}
finally {
    if ($hmac) { $hmac.Dispose() }
    if ($encryptor) { $encryptor.Dispose() }
    if ($aes) { $aes.Dispose() }
    if ($deriveBytes) { $deriveBytes.Dispose() }
    if ($keyBytes) { [Array]::Clear($keyBytes, 0, $keyBytes.Length) }
    if ($encryptionKey) { [Array]::Clear($encryptionKey, 0, $encryptionKey.Length) }
    if ($authenticationKey) { [Array]::Clear($authenticationKey, 0, $authenticationKey.Length) }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Variable password -ErrorAction SilentlyContinue
}
