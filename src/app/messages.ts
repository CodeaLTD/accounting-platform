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
  },
  files: {
    downloadFileName: "intrastat-declaration.xlsx",
  },
} as const;
