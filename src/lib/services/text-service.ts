export class TextService {
  public static getTodayName(desiredLang: string | undefined): string {
    const en: string[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const de: string[] = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    const ru: string[] = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
    const pt: string[] = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
    const nl: string[] = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
    const fr: string[] = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
    const it: string[] = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
    const es: string[] = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const pl: string[] = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
    const uk: string[] = ["понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота", "неділя"];
    const zh: string[] = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    const dow: number = (new Date().getDay() + 6) % 7;

    switch (desiredLang as string) {
      case "en":
        return en[dow];
      case "de":
        return de[dow];
      case "ru":
        return ru[dow];
      case "pt":
        return pt[dow];
      case "nl":
        return nl[dow];
      case "fr":
        return fr[dow];
      case "it":
        return it[dow];
      case "es":
        return es[dow];
      case "uk":
        return uk[dow];
      case "pl":
        return pl[dow];
      case "zh-cn":
        return zh[dow];
    }
    return en[dow];
  }

  public static getDateFormat(dateFormat: string): string {
    let sPattern: string = "/";
    if (!dateFormat.includes(sPattern)) {
      sPattern = "-";
      if (!dateFormat.includes(sPattern)) {
        sPattern = ".";
        if (!dateFormat.includes(sPattern))
          return "%y/%m/%d";
      }
    }
    let rDate: string = "";
    for (const val of dateFormat.split(sPattern)) {
      switch (val) {
        case "YYYY":
          rDate += "%y";
          break;
        case "YY":
          rDate += "%y";
          break;
        case "Y":
          rDate += "%Y";
          break;
        case "MMMM":
          rDate += "%B";
          break;
        case "MMM":
          rDate += "%b";
          break;
        case "MM":
          rDate += "%m";
          break;
        case "M":
          rDate += "%-m";
          break;
        case "DD":
          rDate += "%d";
          break;
        case "D":
          rDate += "%-d";
          break;
      }
      rDate = rDate + sPattern;
    }
    rDate = rDate.slice(0, rDate.length - 1);
    return rDate;
  }
}
