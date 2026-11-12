// DCTap Core Types (matching backend)

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isLocked?: boolean;
  sourceName?: string;      // BLUECORE: synced workspaces ("LC Latest"): where it comes from
  sourceUrl?: string;       // BLUECORE: and a page showing that source
  sourceUpdatedAt?: number; // BLUECORE: and when that source last changed (see backend/src/bluecore/sync.ts)
}

export interface Folder {
  id: number;
  name: string;
  createdAt: number;
}

export interface Shape {
  id: number;
  shapeId: string;
  shapeLabel: string | null;
  description: string | null;
  resourceURI: string | null;
  folderId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface StatementRow {
  id: number;
  rowOrder: number;
  propertyId: string | null;
  propertyLabel: string | null;
  mandatory: string | null;
  repeatable: string | null;
  valueNodeType: string | null;
  valueDataType: string | null;
  valueShape: string | null;
  valueConstraint: string | null;
  valueConstraintType: string | null;
  lcDefaultLiteral: string | null;
  lcDefaultURI: string | null;
  note: string | null;
  lcDataTypeURI: string | null;
  lcRemark: string | null;
  hasErrors: number;
  errorDetails: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Namespace {
  id: number;
  prefix: string;
  namespace: string;
  createdAt: number;
}

// Workspace options
export interface WorkspaceOptions {
  useLCColumns: boolean;
}

// Valid values for constrained fields
export const VALUE_NODE_TYPES = ['IRI', 'literal', 'bnode'] as const;
export type ValueNodeType = typeof VALUE_NODE_TYPES[number];

export const VALUE_CONSTRAINT_TYPES = [
  'picklist',
  'IRIstem',
  'pattern',
  'languageTag',
  'minLength',
  'maxLength',
  'minInclusive',
  'maxInclusive'
] as const;
export type ValueConstraintType = typeof VALUE_CONSTRAINT_TYPES[number];

export const XSD_DATATYPES = [
  'xsd:string',
  'xsd:boolean',
  'xsd:decimal',
  'xsd:integer',
  'xsd:float',
  'xsd:double',
  'xsd:date',
  'xsd:dateTime',
  'xsd:time',
  'xsd:duration',
  'xsd:gYear',
  'xsd:gYearMonth',
  'xsd:anyURI',
  'rdf:langString'
] as const;
export type XsdDatatype = typeof XSD_DATATYPES[number];

// Column definitions for spreadsheet
export interface ColumnDef {
  key: string;
  label: string;
  width: number;
  editorType: 'text' | 'checkbox' | 'dropdown' | 'typeahead' | 'multiline' | 'multiline-typeahead';
  options?: readonly string[];
  disabled?: (row: StatementRow) => boolean;
  firstRowOnly?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { key: 'shapeLabel', label: 'Shape Label', width: 120, editorType: 'text', firstRowOnly: true },
  { key: 'resourceURI', label: 'Resource URI', width: 180, editorType: 'typeahead', firstRowOnly: true },
  { key: 'propertyId', label: 'Property ID', width: 180, editorType: 'typeahead' },
  { key: 'propertyLabel', label: 'Property Label', width: 150, editorType: 'text' },
  { key: 'mandatory', label: 'Mandatory', width: 80, editorType: 'checkbox' },
  { key: 'repeatable', label: 'Repeatable', width: 80, editorType: 'checkbox' },
  { key: 'valueNodeType', label: 'Node Type', width: 100, editorType: 'dropdown', options: VALUE_NODE_TYPES },
  {
    key: 'valueDataType',
    label: 'Data Type',
    width: 120,
    editorType: 'dropdown',
    options: XSD_DATATYPES,
    disabled: (row) => row.valueNodeType !== null && row.valueNodeType?.toLowerCase() !== 'literal'
  },
  {
    key: 'valueShape',
    label: 'Value Shape',
    width: 120,
    editorType: 'multiline-typeahead',
    disabled: (row) => row.valueNodeType?.toLowerCase() === 'literal'
  },
  { key: 'valueConstraint', label: 'Constraint', width: 150, editorType: 'multiline' },
  { key: 'valueConstraintType', label: 'Constraint Type', width: 120, editorType: 'dropdown', options: VALUE_CONSTRAINT_TYPES },
  { key: 'lcDefaultLiteral', label: 'LC Default Literal', width: 180, editorType: 'multiline' },
  { key: 'lcDefaultURI', label: 'LC Default URI', width: 180, editorType: 'multiline' },
  { key: 'lcDataTypeURI', label: 'LC dataTypeURI', width: 180, editorType: 'typeahead' },
  { key: 'note', label: 'Note', width: 200, editorType: 'multiline' },
  { key: 'lcRemark', label: 'LC Remark', width: 200, editorType: 'multiline' }
];

// Validation types
export interface ValidationError {
  row?: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Spreadsheet types
export interface CellPosition {
  row: number;
  col: number;
}

export interface Selection {
  start: CellPosition;
  end: CellPosition;
}

export interface UndoState {
  type: 'cell' | 'row_add' | 'row_delete' | 'row_reorder' | 'bulk';
  before: unknown;
  after: unknown;
  rowId?: number;
  column?: string;
  timestamp: number;
}
