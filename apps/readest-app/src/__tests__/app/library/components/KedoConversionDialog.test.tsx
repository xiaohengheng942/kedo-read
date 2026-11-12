import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { strToU8, zipSync } from 'fflate';
import KedoConversionDialog from '@/app/library/components/KedoConversionDialog';
const taskMemory = vi.hoisted(() => ({ value: null as unknown }));
const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn(async () => ['First page', 'Second page']) }));
vi.mock('@/services/kedo/pdfToEpub', () => ({ extractPdfPages: extractMock, isPrimarilyEnglish: () => true, pagesToEpub: async () => ({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer }) }));
vi.mock('@/services/kedo/resumableTask', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/kedo/resumableTask')>();
  return { ...actual, createIndexedTaskStore: () => ({
    read: async () => structuredClone(taskMemory.value),
    write: async (task: unknown) => { taskMemory.value = structuredClone(task); },
    clear: async () => { taskMemory.value = null; },
  }) };
});
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: (selector: (s: unknown) => unknown) => selector({ settings: { globalReadSettings: { translationProvider: 'azure' } } }) }));
const { translateMock } = vi.hoisted(() => ({ translateMock: vi.fn(async (_text: string[]) => ['你好世界']) }));
vi.mock('@/components/Dialog', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: { saveFile: vi.fn() } }) }));
vi.mock('@/services/translators', () => ({
  getTranslators: () => [{ name: 'azure', label: 'Azure Translator', translate: translateMock }, { name: 'google', label: 'Google Translate', translate: translateMock }, { name: 'yandex', label: 'Yandex Translate', translate: translateMock }, { name: 'test', label: '测试服务', translate: translateMock }],
}));

afterEach(cleanup);

describe('book conversion dialog', () => {
  it('translates an EPUB with the selected service and sends a new file to library import', async () => {
    taskMemory.value = null;
    const data = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
      ),
      'book.opf': strToU8(
        '<package><manifest><item href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest></package>',
      ),
      'chapter.xhtml': strToU8('<html><body><p>Hello world</p></body></html>'),
    });
    const file = new File([new Uint8Array(data).buffer], 'source.epub');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(data).buffer });
    const onImport = vi.fn(async (_file: File) => {});
    const { container, rerender } = render(
      <KedoConversionDialog isOpen onClose={() => {}} onImport={onImport} />,
    );
    expect(screen.getByLabelText('选择 PDF 或 EPUB 文件')).toBeTruthy();
    expect((screen.getByLabelText('翻译服务') as HTMLSelectElement).value).toBe('azure');
    await waitFor(() => expect((container.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('翻译服务'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('开始'));
    await screen.findByText('加入书库');
    fireEvent.click(screen.getByText('加入书库'));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0]![0]).toBeInstanceOf(File);
    rerender(<KedoConversionDialog isOpen={false} onClose={() => {}} onImport={onImport} />);
    rerender(<KedoConversionDialog isOpen onClose={() => {}} onImport={onImport} />);
    await screen.findByText('任务已完成，可加入书库或导出。');
    expect(screen.getByText('加入书库')).toBeTruthy();
  });
  it('pauses an EPUB, restores it after reopening, and skips saved segments', async () => {
    taskMemory.value = null;
    translateMock.mockReset();
    let release!: (value: string[]) => void;
    translateMock.mockResolvedValueOnce(['第一段']).mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(['第二段']);
    const data = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),
      'book.opf': strToU8('<package><manifest><item href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest></package>'),
      'chapter.xhtml': strToU8('<html><body><p>First paragraph</p><p>Second paragraph</p></body></html>'),
    });
    const file = new File([new Uint8Array(data).buffer], 'resume.epub');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array(data).buffer });
    const props = { onClose: () => {}, onImport: vi.fn(async () => {}) };
    const { container, rerender } = render(<KedoConversionDialog isOpen {...props} />);
    await waitFor(() => expect((container.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    fireEvent.click(screen.getByText('开始'));
    await waitFor(() => expect(translateMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('暂停任务'));
    release(['第二段']);
    await screen.findByText('任务已暂停；已完成的分段保存在本机。');
    expect(screen.queryByText('导出 EPUB')).toBeNull();
    rerender(<KedoConversionDialog isOpen={false} {...props} />);
    rerender(<KedoConversionDialog isOpen {...props} />);
    await screen.findByText(/1 段已保存/);
    fireEvent.click(screen.getByText('继续任务'));
    await screen.findByText('导出 EPUB');
    expect(translateMock).toHaveBeenCalledTimes(3);
    expect(translateMock.mock.calls[2]![0]).toEqual(['Second paragraph']);
    fireEvent.click(screen.getByText('开始处理下一本'));
    await screen.findByText('请选择下一本书。');
    expect(taskMemory.value).toBeNull();
  });

  it('saves PDF pages and translated segments for a later retry', async () => {
    taskMemory.value = null;
    extractMock.mockClear();
    translateMock.mockReset();
    let release!: (value: string[]) => void;
    translateMock.mockResolvedValueOnce(['第一页']).mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(['第二页']);
    const file = new File([new Uint8Array([1])], 'resume.pdf');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer });
    const props = { onClose: () => {}, onImport: vi.fn(async () => {}) };
    const { container, rerender } = render(<KedoConversionDialog isOpen {...props} />);
    await waitFor(() => expect((container.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    fireEvent.click(screen.getByText('开始'));
    await waitFor(() => expect(translateMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('暂停任务'));
    release(['第二页']);
    await screen.findByText('任务已暂停；已完成的分段保存在本机。');
    rerender(<KedoConversionDialog isOpen={false} {...props} />);
    rerender(<KedoConversionDialog isOpen {...props} />);
    await screen.findByText(/1 段已保存/);
    fireEvent.click(screen.getByText('继续任务'));
    await screen.findByText('导出 EPUB');
    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(translateMock).toHaveBeenCalledTimes(3);
    expect(translateMock.mock.calls[2]![0]).toEqual(['Second page']);
  });

  it('offers a fresh book after a completed task without requiring cancellation', async () => {
    taskMemory.value = { version: 1, filename: 'done.epub', source: new Uint8Array([1]), provider: 'azure', segments: {0:'中文'}, status: 'completed', output: new Uint8Array([2]) };
    render(<KedoConversionDialog isOpen onClose={() => {}} onImport={vi.fn()} />);
    await screen.findByText('任务已完成，可加入书库或导出。');
    fireEvent.click(screen.getByText('开始处理下一本'));
    await waitFor(() => expect(taskMemory.value).toBeNull());
    expect((screen.getByLabelText('选择 PDF 或 EPUB 文件') as HTMLInputElement).disabled).toBe(false);
  });

  it('asks before mixing services or discarding translated segments', async () => {
    taskMemory.value = { version: 1, filename: 'resume.epub', source: new Uint8Array([1]), provider: 'azure', segments: {0:'中文'}, status: 'paused' };
    render(<KedoConversionDialog isOpen onClose={() => {}} onImport={vi.fn()} />);
    await screen.findByText(/1 段已保存/);
    fireEvent.change(screen.getByLabelText('翻译服务'), { target: { value: 'yandex' } });
    fireEvent.click(screen.getByText('继续任务'));
    expect(screen.getByText(/译文可能混用不同服务/)).toBeTruthy();
    expect(screen.getByText('保留已译内容并继续')).toBeTruthy();
    expect(screen.getByText('重新翻译整本书')).toBeTruthy();
    expect((taskMemory.value as {segments: Record<number,string>}).segments[0]).toBe('中文');
  });

});
