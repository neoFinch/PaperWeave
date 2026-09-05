export namespace main {
	
	export class ExportResult {
	    path: string;
	    pages: number;
	
	    static createFrom(source: any = {}) {
	        return new ExportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.pages = source["pages"];
	    }
	}
	export class PDFDocument {
	    id: string;
	    name: string;
	    path: string;
	    pageCount: number;
	    size: number;
	    data: string;
	
	    static createFrom(source: any = {}) {
	        return new PDFDocument(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.pageCount = source["pageCount"];
	        this.size = source["size"];
	        this.data = source["data"];
	    }
	}
	export class PageSelection {
	    path: string;
	    page: number;
	
	    static createFrom(source: any = {}) {
	        return new PageSelection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.page = source["page"];
	    }
	}

}

