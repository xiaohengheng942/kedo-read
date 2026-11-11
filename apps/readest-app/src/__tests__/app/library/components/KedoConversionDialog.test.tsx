import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { strToU8, zipSync } from 'fflate';
import KedoConversionDialog from '@/app/library/components/KedoConversionDialog';
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: (selector: (s: unknown) => unknown) => selector({ settings: { globalReadSettings: { translationProvider: 'azure' } } }) }));
const { translateMock } = vi.hoisted(() => ({ translateMock: vi.fn(async () => ['你好世界']) }));
vi.mock('@/components/Dialog', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: { saveFile: vi.fn() } }) }));
vi.mock('@/services/translators', () => ({
  getTranslators: () => [{ name: 'azure', label: 'Azure Translator', translate: translateMock }, { name: 'google', label: 'Google Translate', translate: translateMock }, { name: 'yandex', label: 'Yandex Translate', translate: translateMock }, { name: 'test', label: '测试服务', translate: translateMock }],
}));

describe('book conversion dialog', () => {
  it('translates an EPUB with the selected service and sends a new file to library import', async () => {
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
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('翻译服务'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('开始'));
    await screen.findByText('加入书库');
    fireEvent.click(screen.getByText('加入书库'));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0]![0]).toBeInstanceOf(File);
    rerender(<KedoConversionDialog isOpen={false} onClose={() => {}} onImport={onImport} />);
    rerender(<KedoConversionDialog isOpen onClose={() => {}} onImport={onImport} />);
    expect(screen.queryByText('加入书库')).toBeNull();
    expect((screen.getByText('开始') as HTMLButtonElement).disabled).toBe(true);
  });
});
