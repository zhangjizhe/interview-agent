declare module 'pdf-parse' {
    interface PDFData {
        numpages: number;
        numrender: number;
        info: Record<string, any>;
        metadata: Record<string, any>;
        text: string;
        version: string;
    }

    function pdfParse(dataBuffer: Buffer): Promise<PDFData>;
    export default pdfParse;
}
