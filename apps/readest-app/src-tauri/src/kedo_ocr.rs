use std::io::Write;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn kedo_ocr(app: AppHandle, image: Vec<u8>) -> Result<String, String> {
    if image.is_empty() || image.len() > 20_000_000 {
        return Err("页面图像为空或过大，无法识别。".into());
    }
    let executable = app.path().resolve("kedo-ocr", tauri::path::BaseDirectory::Resource)
        .map_err(|_| "无法找到系统文字识别组件。".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut child = Command::new(executable)
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
            .spawn().map_err(|_| "无法启动系统文字识别组件。".to_string())?;
        let mut stdin = child.stdin.take().ok_or("无法启动文字识别输入。")?;
        stdin.write_all(&image).map_err(|_| "无法发送页面图像进行识别。")?;
        drop(stdin);
        let output = child.wait_with_output().map_err(|_| "系统文字识别失败。")?;
        if !output.status.success() { return Err("系统文字识别失败。".into()); }
        String::from_utf8(output.stdout).map_err(|_| "识别结果格式错误。".into())
    }).await.map_err(|_| "系统文字识别任务失败。".to_string())?
}
