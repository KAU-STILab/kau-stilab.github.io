Board 암호화 적용 방법

PowerShell에서 저장소 루트로 이동한 다음 실행:

   Set-ExecutionPolicy -Scope Process Bypass
   .\tools\encrypt-board.ps1

   Board password 입력란에 사용할 비밀번호를 입력한다.
   생성된 board\board-content.enc.json만 Commit/Push한다.
