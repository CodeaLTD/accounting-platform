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
    saveFailed:
      "Файлът не можа да бъде запазен. Моля, опитайте отново.",
    selectPartnerCountry: "Изберете страна партньор",
    selectModeOfTransport: "Изберете вид транспорт",
    selectRegionOfConsumption: "Изберете регион на потребление",
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
    viewFinalTableButton: "Виж НАП таблицата",
    viewWorkingTableButton: "Виж работната таблица",
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
  license: {
    checkingMessage: "Проверка на лиценза...",
    lockedTitle: "Устройството не е активирано",
    lockedMessage:
      "Това устройство все още няма активен платен достъп. Моля, свържете се с поддръжката и посочете кода на устройството по-долу.",
    offlineMessage:
      "Няма връзка със сървъра за лицензиране. Моля, проверете интернет връзката си и опитайте отново.",
    credentialsMessage:
      "Проблем с идентификацията на устройството. Моля, свържете се с поддръжката и посочете кода на устройството по-долу.",
    deviceIdLabel: "Код на устройството",
    retryButton: "Провери отново",
  },
  registration: {
    title: "Регистрация на устройството",
    description:
      "За да продължите, моля въведете имейл и потребителско име, за да можем да свържем това устройство с вас.",
    emailLabel: "Имейл",
    usernameLabel: "Потребителско име",
    submitButton: "Регистрирай",
    errorMessage:
      "Регистрацията не бе успешна. Моля, проверете интернет връзката си и опитайте отново.",
    conflictMessage:
      "Това устройство вече е регистрирано. Моля, свържете се с поддръжката и посочете кода на устройството по-долу.",
  },
} as const;
