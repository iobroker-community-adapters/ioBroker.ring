export class TextService {
  public static getdetectionType(type: string, desiredLang: string | undefined): string {
    const dt: string[] = [
      "null", "human", "loitering", "motion", "moving_vehicle",
      "nearby_pom", "other_motion", "package_delivery", "package_pickup"
    ];
    const en: string[] = [
      "not specified", "human", "loitering", "motion", "moving vehicle",
      "nearby", "other motion", "package delivery", "package pickup"
    ];
    const de: string[] = [
      "nicht angegeben", "Person", "herumlungern", "Bewegung", "Fahrzeug",
      "nah", "andere Bewegung", "Paketzustellung", "Paketabholung"
    ];
    const ru: string[] = [
      "не указан", "человек", "слоняться вокруг", "Движение", "транспортное средство",
      "закрывать", "другое движение", "Доставка посылки", "Получение посылки"
    ];
    const pt: string[] = [
      "não especificado", "Pessoa", "vadiar por aí", "Movimento", "Veículo",
      "fechar", "outro movimento", "Entrega de encomendas", "Retirada de pacote"
    ];
    const nl: string[] = [
      "niet gespecificeerd", "Persoon", "rondhangen", "Beweging", "Voertuig",
      "dichtbij", "andere beweging", "Pakket levering", "Pakket ophalen"
    ];
    const fr: string[] = [
      "non spécifié", "Personne", "flâner", "Mouvement", "Véhicule",
      "fermer", "autre mouvement", "Livraison de colis", "Ramassage des colis"
    ];
    const it: string[] = [
      "non specificato", "Persona", "bighellonare in giro", "Movimento", "Veicolo",
      "vicino", "altro movimento", "Consegna pacchi", "Ritiro del pacco"
    ];
    const es: string[] = [
      "No especificado", "Persona", "holgazanear", "Movimiento", "Vehículo",
      "cerca", "otro movimiento", "Entrega de paquetes", "Recogida de paquetes"
    ];
    const pl: string[] = [
      "nieokreślony", "Osoba", "włóczyć się po okolicy", "Ruch", "Pojazd",
      "zamknąć", "inny ruch", "Dostawa paczek", "Odbiór paczki"
    ];
    const uk: string[] = [
      "не визначено", "людина", "тинятися навколо", "Pyx", "транспортний засіб",
      "закрити", "інший рух", "Доставка посилок", "Вивіз посилки"
    ];
    const zh: string[] = [
      "未指定", "人", "闲逛", "移动", "车辆",
      "关闭", "其他运动", "包裹递送", "包裹领取"
    ];

    const i:number = dt.indexOf(type);
    if (i == -1) return type;

    switch (desiredLang as string) {
      case "en":
        return en[i];
      case "de":
        return de[i];
      case "ru":
        return ru[i];
      case "pt":
        return pt[i];
      case "nl":
        return nl[i];
      case "fr":
        return fr[i];
      case "it":
        return it[i];
      case "es":
        return es[i];
      case "uk":
        return uk[i];
      case "pl":
        return pl[i];
      case "zh-cn":
        return zh[i];
    }
    return en[i];
  }
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
