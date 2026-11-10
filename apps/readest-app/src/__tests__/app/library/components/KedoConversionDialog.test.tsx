import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { strToU8, zipSync } from 'fflate';
import KedoConversionDialog from '@/app/library/components/KedoConversionDialog';
vi.mock('@/components/Dialog', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: { saveFile: vi.fn() } }) }));
vi.mock('@/services/translators', () => ({
  getTranslators: () => [{ name: 'test', label: '测试服务', translate: async () => ['你好世界'] }],
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
    const { container } = render(
      <KedoConversionDialog isOpen onClose={() => {}} onImport={onImport} />,
    );
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('翻译服务'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('开始'));
    await screen.findByText('加入书库');
    fireEvent.click(screen.getByText('加入书库'));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport.mock.calls[0]![0]).toBeInstanceOf(File);
  });
});
