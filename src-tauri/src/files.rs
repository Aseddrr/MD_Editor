use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

const MAX_MARKDOWN_BYTES: u64 = 16 * 1024 * 1024;
const SKIPPED_DIRECTORIES: &[&str] = &[".git", ".idea", ".vscode", "node_modules", "target"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    path: String,
    content: String,
    line_ending: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    name: String,
    path: String,
    is_directory: bool,
    children: Vec<FileTreeNode>,
}

#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<DocumentPayload, String> {
    let path = PathBuf::from(path);
    ensure_markdown_extension(&path)?;

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("无法访问文件：{error}"))?;
    let metadata = canonical_path
        .metadata()
        .map_err(|error| format!("无法读取文件信息：{error}"))?;

    if !metadata.is_file() {
        return Err("所选路径不是文件。".to_owned());
    }
    if metadata.len() > MAX_MARKDOWN_BYTES {
        return Err("文件超过 16 MiB，为避免界面卡顿已停止打开。".to_owned());
    }

    let content = fs::read_to_string(&canonical_path)
        .map_err(|error| format!("无法以 UTF-8 读取文件：{error}"))?;
    let line_ending = detect_line_ending(&content).to_owned();

    Ok(DocumentPayload {
        path: canonical_path.to_string_lossy().into_owned(),
        content,
        line_ending,
    })
}

#[tauri::command]
pub fn write_markdown_file(
    path: String,
    content: String,
    line_ending: String,
) -> Result<String, String> {
    let path = PathBuf::from(path);
    ensure_markdown_extension(&path)?;

    let parent = path
        .parent()
        .ok_or_else(|| "保存路径缺少父目录。".to_owned())?;
    if !parent.is_dir() {
        return Err("保存目录不存在。".to_owned());
    }
    if path.exists() && !path.is_file() {
        return Err("保存路径不是普通文件。".to_owned());
    }

    let normalized_content = normalize_line_endings(&content, &line_ending);
    let file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&path)
        .map_err(|error| format!("无法打开文件进行保存：{error}"))?;
    let mut writer = BufWriter::new(file);
    writer
        .write_all(normalized_content.as_bytes())
        .and_then(|_| writer.flush())
        .and_then(|_| writer.get_ref().sync_all())
        .map_err(|error| format!("保存文件失败：{error}"))?;

    let saved_path = path
        .canonicalize()
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned();
    Ok(saved_path)
}

#[tauri::command]
pub fn scan_markdown_tree(root_path: String) -> Result<Vec<FileTreeNode>, String> {
    let root = PathBuf::from(root_path)
        .canonicalize()
        .map_err(|error| format!("无法访问文件夹：{error}"))?;
    if !root.is_dir() {
        return Err("所选路径不是文件夹。".to_owned());
    }

    scan_directory(&root, true).map(|node| node.map_or_else(Vec::new, |node| node.children))
}

#[tauri::command]
pub fn startup_markdown_path() -> Option<String> {
    let args = std::env::args_os()
        .skip(1)
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    markdown_path_from_args(&args)
}

pub(crate) fn markdown_path_from_args(args: &[String]) -> Option<String> {
    args.iter().find_map(|argument| {
        let path = PathBuf::from(argument);
        if !is_markdown_path(&path) {
            return None;
        }
        let canonical_path = path.canonicalize().ok()?;
        canonical_path
            .is_file()
            .then(|| canonical_path.to_string_lossy().into_owned())
    })
}

fn scan_directory(path: &Path, report_error: bool) -> Result<Option<FileTreeNode>, String> {
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if report_error => return Err(format!("无法读取文件夹：{error}")),
        Err(_) => return Ok(None),
    };

    let mut children = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let directory_name = entry.file_name().to_string_lossy().into_owned();
            if should_skip_directory(&directory_name) {
                continue;
            }
            if let Some(node) = scan_directory(&entry_path, false)? {
                children.push(node);
            }
        } else if file_type.is_file() && is_markdown_path(&entry_path) {
            children.push(FileTreeNode {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry_path.to_string_lossy().into_owned(),
                is_directory: false,
                children: Vec::new(),
            });
        }
    }

    children.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    if children.is_empty() && !report_error {
        return Ok(None);
    }

    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    Ok(Some(FileTreeNode {
        name,
        path: path.to_string_lossy().into_owned(),
        is_directory: true,
        children,
    }))
}

fn should_skip_directory(name: &str) -> bool {
    name.starts_with('.')
        || SKIPPED_DIRECTORIES
            .iter()
            .any(|skipped| name.eq_ignore_ascii_case(skipped))
}

fn ensure_markdown_extension(path: &Path) -> Result<(), String> {
    if is_markdown_path(path) {
        Ok(())
    } else {
        Err("仅支持 .md 和 .markdown 文件。".to_owned())
    }
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn detect_line_ending(content: &str) -> &'static str {
    if content.contains("\r\n") {
        "crlf"
    } else {
        "lf"
    }
}

fn normalize_line_endings(content: &str, line_ending: &str) -> String {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    if line_ending.eq_ignore_ascii_case("crlf") {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_markdown_extensions_case_insensitively() {
        assert!(is_markdown_path(Path::new("notes.md")));
        assert!(is_markdown_path(Path::new("notes.MARKDOWN")));
        assert!(!is_markdown_path(Path::new("notes.txt")));
    }

    #[test]
    fn preserves_requested_line_endings() {
        assert_eq!(normalize_line_endings("a\r\nb\n", "lf"), "a\nb\n");
        assert_eq!(normalize_line_endings("a\nb\n", "crlf"), "a\r\nb\r\n");
    }

    #[test]
    fn command_round_trip_writes_and_reads_utf8_markdown() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let path = temporary.path().join("笔记.md");

        let saved_path = write_markdown_file(
            path.to_string_lossy().into_owned(),
            "# 标题\n正文\n".to_owned(),
            "crlf".to_owned(),
        )
        .expect("write succeeds");
        let raw = fs::read(&path).expect("saved bytes");
        assert!(raw.windows(2).any(|window| window == b"\r\n"));

        let loaded = read_markdown_file(saved_path).expect("read succeeds");
        assert_eq!(loaded.content, "# 标题\r\n正文\r\n");
        assert_eq!(loaded.line_ending, "crlf");
    }

    #[test]
    fn commands_reject_non_markdown_extensions() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let path = temporary.path().join("notes.txt");
        let result = write_markdown_file(
            path.to_string_lossy().into_owned(),
            "content".to_owned(),
            "lf".to_owned(),
        );
        assert!(result.is_err());
        assert!(!path.exists());
    }

    #[test]
    fn startup_arguments_select_existing_markdown_with_unicode_and_spaces() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let markdown_path = temporary.path().join("中文 note.md");
        fs::write(&markdown_path, "# 文件").expect("markdown file");
        let args = vec![
            "lightmark.exe".to_owned(),
            "--ignored".to_owned(),
            markdown_path.to_string_lossy().into_owned(),
        ];

        let selected = markdown_path_from_args(&args).expect("markdown argument");
        assert_eq!(
            PathBuf::from(selected),
            markdown_path.canonicalize().unwrap()
        );
    }

    #[test]
    fn startup_arguments_ignore_missing_and_non_markdown_paths() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let text_path = temporary.path().join("notes.txt");
        fs::write(&text_path, "text").expect("text file");
        let args = vec![
            text_path.to_string_lossy().into_owned(),
            temporary
                .path()
                .join("missing.md")
                .to_string_lossy()
                .into_owned(),
        ];

        assert_eq!(markdown_path_from_args(&args), None);
    }

    #[test]
    fn scan_keeps_only_markdown_branches_and_skips_build_directories() {
        let temporary = tempfile::tempdir().expect("temporary directory");
        let root = temporary.path();
        fs::write(root.join("root.md"), "# Root").expect("root markdown");
        fs::write(root.join("ignore.txt"), "ignore").expect("text file");
        fs::create_dir(root.join("docs")).expect("docs directory");
        fs::write(root.join("docs").join("guide.markdown"), "# Guide").expect("nested markdown");
        fs::create_dir(root.join("empty")).expect("empty directory");
        fs::create_dir(root.join("node_modules")).expect("node_modules directory");
        fs::write(root.join("node_modules").join("hidden.md"), "# Hidden")
            .expect("ignored markdown");

        let tree = scan_directory(root, true)
            .expect("scan succeeds")
            .expect("root node exists");

        assert_eq!(tree.children.len(), 2);
        assert_eq!(tree.children[0].name, "docs");
        assert_eq!(tree.children[0].children[0].name, "guide.markdown");
        assert_eq!(tree.children[1].name, "root.md");
    }
}
