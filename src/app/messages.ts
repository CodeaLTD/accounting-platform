// Centralized user-facing copy. Edit wording/language here only — no
// component should hardcode a user-facing string.
export const MESSAGES = {
  errors: {
    invalidFileType:
      "Това не прилича на Excel файл. Моля, изберете файла с фактурите (.xls или .xlsx).",
    unrecognizedStructure:
      "Този файл не съответства на очаквания формат на фактура. Моля, проверете дали е правилният файл и опитайте отново.",
    emptyFile: "В този файл не бяха намерени редове с фактури.",
    invalidNumericValue:
      "Моля, попълнете всички числови полета преди изтегляне.",
  },
  labels: {
    partnerCountry: "Страна партньор",
    modeOfTransport: "Вид транспорт",
    regionOfConsumption: "Регион на потребление",
    fileInput: "Качете файл с фактури",
    chooseFileButton: "Изберете файл",
    downloadButton: "Изтеглете декларация",
    invoiceNumberColumn: "Фактура №",
    searchInput: "Търсене по номер на фактура",
    addAllButton: "Добави всички",
    addRowButton: "Добави ред",
    removeRowButton: "Премахни ред",
    removeAllButton: "Премахни всички",
    viewFinalTableButton: "виж НАП таблицата",
    viewWorkingTableButton: "виж работната таблица",
  },
  files: {
    downloadFileName: "intrastat-declaration.xlsx",
  },
  confirmations: {
    discardUnaddedRows: (count: number) =>
      count === 1
        ? `Имате 1 ред, който не е добавен към НАП таблицата. Той ще бъде загубен. Продължавате ли?`
        : `Имате ${count} реда, които не са добавени към НАП таблицата. Те ще бъдат загубени. Продължавате ли?`,
  },
} as const;
