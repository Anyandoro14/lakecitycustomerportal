import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const GREEN = rgb(0.043, 0.239, 0.18);
export const GOLD = rgb(0.85, 0.65, 0.13);
export const GREY = rgb(0.4, 0.4, 0.4);

/** Tiny flowing-layout helper on top of pdf-lib (A4, top-down cursor). */
export class PdfBuilder {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y = 0;
  readonly margin = 48;
  readonly width = 595.28;
  readonly height = 841.89;

  static async create(title: string, subtitle: string) {
    const b = new PdfBuilder();
    b.doc = await PDFDocument.create();
    b.doc.setTitle(title);
    b.font = await b.doc.embedFont(StandardFonts.Helvetica);
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold);
    b.newPage();
    b.page.drawRectangle({ x: 0, y: b.height - 70, width: b.width, height: 70, color: GREEN });
    b.page.drawText("LakeCity", { x: b.margin, y: b.height - 42, size: 20, font: b.bold, color: rgb(1, 1, 1) });
    b.page.drawText("PLACEHOLDER LAYOUT", { x: b.width - b.margin - 120, y: b.height - 40, size: 9, font: b.bold, color: GOLD });
    b.y = b.height - 100;
    b.text(title, { size: 16, font: b.bold, color: GREEN });
    b.text(subtitle, { size: 9, color: GREY });
    b.gap(8);
    return b;
  }

  newPage() {
    this.page = this.doc.addPage([this.width, this.height]);
    this.y = this.height - this.margin;
  }

  ensure(space: number) {
    if (this.y - space < this.margin) this.newPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  text(t: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.font ?? this.font;
    const maxWidth = o.maxWidth ?? this.width - this.margin * 2;
    const lines: string[] = [];
    for (const para of t.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    for (const l of lines) {
      this.ensure(size + 4);
      this.page.drawText(l, { x: o.x ?? this.margin, y: this.y - size, size, font, color: o.color ?? rgb(0.1, 0.1, 0.1) });
      this.y -= size + 4;
    }
  }

  keyValues(rows: [string, string][]) {
    for (const [k, v] of rows) {
      this.ensure(16);
      this.page.drawText(k, { x: this.margin, y: this.y - 10, size: 9, font: this.font, color: GREY });
      this.text(v || "—", { x: this.margin + 170, size: 10, maxWidth: this.width - this.margin * 2 - 170 });
    }
  }

  table(headers: string[], widths: number[], rows: string[][], alignRight: boolean[] = []) {
    const drawRow = (cells: string[], font: PDFFont, shade: boolean) => {
      this.ensure(18);
      if (shade) {
        this.page.drawRectangle({ x: this.margin, y: this.y - 15, width: this.width - this.margin * 2, height: 16, color: rgb(0.95, 0.97, 0.96) });
      }
      let x = this.margin + 4;
      cells.forEach((c, i) => {
        const w = widths[i];
        const tx = alignRight[i] ? x + w - 8 - font.widthOfTextAtSize(c, 9) : x;
        this.page.drawText(c, { x: tx, y: this.y - 11, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
        x += w;
      });
      this.y -= 16;
    };
    drawRow(headers, this.bold, true);
    rows.forEach((r, i) => {
      if (this.y - 18 < this.margin) {
        this.newPage();
        drawRow(headers, this.bold, true);
      }
      drawRow(r, this.font, i % 2 === 1);
    });
  }

  async bytes() {
    return this.doc.save();
  }
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
