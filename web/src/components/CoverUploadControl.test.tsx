// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoverUploadControl } from './CoverUploadControl';

const baseProps = {
  coverSize: 200,
  coverClassName: 'w-32 h-32',
  alt: 'Test cover',
  shape: 'square' as const,
  hasCover: false,
  uploadTitle: 'Upload cover',
  removeTitle: 'Reset to default cover',
  onUpload: vi.fn(),
  onRemove: vi.fn(),
};

describe('CoverUploadControl', () => {
  it('renders the upload control but not the remove button when there is no cover', () => {
    render(<CoverUploadControl {...baseProps} />);
    expect(screen.getByTitle('Upload cover')).toBeInTheDocument();
    expect(screen.queryByTitle('Reset to default cover')).not.toBeInTheDocument();
  });

  it('renders the remove button when hasCover is true', () => {
    render(<CoverUploadControl {...baseProps} hasCover={true} />);
    expect(screen.getByTitle('Reset to default cover')).toBeInTheDocument();
  });

  it('calls onUpload with the selected file', async () => {
    const onUpload = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<CoverUploadControl {...baseProps} onUpload={onUpload} />);

    const file = new File(['fake-image-bytes'], 'cover.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it('calls onRemove when the remove button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<CoverUploadControl {...baseProps} hasCover={true} onRemove={onRemove} />);

    await user.click(screen.getByTitle('Reset to default cover'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows the error message when provided', () => {
    render(<CoverUploadControl {...baseProps} error="Upload failed" />);
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('shows no error message when error is null', () => {
    render(<CoverUploadControl {...baseProps} error={null} />);
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it('hides upload/remove/error controls entirely when visible is false, but still renders the cover', () => {
    render(
      <CoverUploadControl
        {...baseProps}
        coverId="al-1"
        hasCover={true}
        visible={false}
        error="Upload failed"
        alt="Hidden-controls cover"
      />,
    );
    expect(screen.queryByTitle('Upload cover')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Reset to default cover')).not.toBeInTheDocument();
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
    // The cover image itself still renders even with controls hidden.
    expect(screen.getByAltText('Hidden-controls cover')).toBeInTheDocument();
  });

  it('uses a circular hover-overlay for shape="circle" and a rounded-square one for shape="square"', () => {
    const { rerender, container } = render(<CoverUploadControl {...baseProps} shape="circle" />);
    expect(container.querySelector('button[title="Upload cover"]')?.className).toContain('rounded-full');

    rerender(<CoverUploadControl {...baseProps} shape="square" />);
    expect(container.querySelector('button[title="Upload cover"]')?.className).toContain('rounded-lg');
  });
});
