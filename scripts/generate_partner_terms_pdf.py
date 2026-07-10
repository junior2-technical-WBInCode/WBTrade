# -*- coding: utf-8 -*-
"""Generates the downloadable "Warunki Wspolpracy - Program Partnerski WB Trade" PDF.

Run with: python scripts/generate_partner_terms_pdf.py
Output: apps/web/public/documents/warunki-wspolpracy-programu-partnerskiego.pdf
"""
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER

OUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "apps", "web", "public", "documents",
    "warunki-wspolpracy-programu-partnerskiego.pdf",
)

# ReportLab's built-in base14 fonts (Helvetica/Times) only support WinAnsi
# encoding and render Polish letters (ł, ć, ś, ź, ż, ń, ę, ą, ó) as black
# boxes. Register a real Unicode TTF font instead so diacritics show up
# correctly. Prefer bundled project fonts (portable across OS/CI); fall back
# to system fonts (Windows: Arial, Linux/Mac: DejaVu Sans) if none are bundled.
FONT_CANDIDATES = [
    (
        os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans.ttf"),
        os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans-Bold.ttf"),
    ),
    (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
]

FONT_NAME = "PLFont"
FONT_NAME_BOLD = "PLFont-Bold"

for regular_path, bold_path in FONT_CANDIDATES:
    if os.path.isfile(regular_path) and os.path.isfile(bold_path):
        pdfmetrics.registerFont(TTFont(FONT_NAME, regular_path))
        pdfmetrics.registerFont(TTFont(FONT_NAME_BOLD, bold_path))
        pdfmetrics.registerFontFamily(FONT_NAME, normal=FONT_NAME, bold=FONT_NAME_BOLD, italic=FONT_NAME, boldItalic=FONT_NAME_BOLD)
        break
else:
    sys.exit(
        "Nie znaleziono czcionki Unicode (Arial/DejaVu Sans) obslugującej polskie znaki. "
        "Umieść DejaVuSans.ttf i DejaVuSans-Bold.ttf w scripts/fonts/ lub uruchom skrypt tam, "
        "gdzie dostepny jest system font Arial/DejaVu Sans."
    )

styles = getSampleStyleSheet()
h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName=FONT_NAME_BOLD, textColor=colors.HexColor("#1a2233"))
h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName=FONT_NAME_BOLD, textColor=colors.HexColor("#1a2233"), spaceBefore=14)
h3 = ParagraphStyle("h3", parent=styles["Heading3"], fontName=FONT_NAME_BOLD, textColor=colors.HexColor("#e07b1d"), spaceBefore=10)
body = ParagraphStyle("body", parent=styles["BodyText"], fontName=FONT_NAME, spaceAfter=6, leading=14)
small = ParagraphStyle("small", parent=styles["BodyText"], fontName=FONT_NAME, fontSize=8.5, textColor=colors.grey)
title_style = ParagraphStyle("title", parent=styles["Title"], fontName=FONT_NAME_BOLD, alignment=TA_CENTER)
subtitle_style = ParagraphStyle("subtitle", parent=styles["Heading2"], fontName=FONT_NAME_BOLD, alignment=TA_CENTER, textColor=colors.HexColor("#e07b1d"))

TABLE_HEADER_BG = colors.HexColor("#1a2233")
TABLE_ALT_BG = colors.HexColor("#f5f6f8")


cell_style = ParagraphStyle("cell", parent=body, fontName=FONT_NAME, fontSize=9, leading=11, spaceAfter=0)
cell_header_style = ParagraphStyle("cellHeader", parent=cell_style, fontName=FONT_NAME_BOLD, textColor=colors.white)


def table(data, col_widths=None):
    # ReportLab does NOT auto-wrap plain strings inside Table cells — long text simply
    # overflows into the neighbouring column instead of wrapping, which is what produced
    # the overlapping/garbled text in the "Warunki awansu" tables. Wrapping every cell in
    # a Paragraph makes it reflow within its own column width (growing the row instead).
    wrapped_rows = []
    for row_idx, row in enumerate(data):
        style = cell_header_style if row_idx == 0 else cell_style
        wrapped_rows.append([Paragraph(cell, style) if isinstance(cell, str) else cell for cell in row])

    t = Table(wrapped_rows, colWidths=col_widths, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d9dce1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data), 2):
        style.append(("BACKGROUND", (0, i), (-1, i), TABLE_ALT_BG))
    t.setStyle(TableStyle(style))
    return t


def section(num, title_text):
    return Paragraph(f"{num}. {title_text}", h2)


def p(text):
    return Paragraph(text, body)


def bullets(items):
    return Paragraph("<br/>".join(f"&bull; {i}" for i in items), body)


story = []

# Cover
story.append(Spacer(1, 60))
story.append(Paragraph("Warunki Wsp\u00f3\u0142pracy", title_style))
story.append(Spacer(1, 8))
story.append(Paragraph("Program Partnerski WB Trade", subtitle_style))
story.append(Spacer(1, 20))
story.append(Paragraph("Data ostatniej aktualizacji: <b>2026-07-09</b>", ParagraphStyle("d", parent=body, alignment=TA_CENTER)))
story.append(PageBreak())

# 1. Postanowienia ogolne
story.append(section(1, "Postanowienia og\u00f3lne"))
story.append(p("1. Organizatorem programu <b>WB Trade Partners</b> jest:<br/>"
               "<b>WB Partners Sp. z o.o.</b><br/>"
               "ul. Juliusza S\u0142owackiego 24/11, 35-060 Rzesz\u00f3w<br/>"
               "NIP: 5170455185 &bull; REGON: 540735769 &bull; KRS: 0001151642"))
story.append(p("2. Program WB Trade Partners jest programem partnerskim skierowanym g\u0142\u00f3wnie do os\u00f3b "
               "fizycznych, umo\u017cliwiaj\u0105cym osi\u0105ganie wynagrodzenia z tytu\u0142u: sprzeda\u017cy w\u0142asnej, budowy "
               "zespo\u0142u oraz rozwoju liderów w strukturze."))
story.append(p("3. Program dzia\u0142a w oparciu o zasady okre\u015blone w niniejszym regulaminie oraz bie\u017c\u0105ce warunki "
               "opublikowane przez Organizatora."))
story.append(p("4. Kontakt programu: <b>agencja@wb-horizon.pl</b> &bull; <b>570 038 828</b>"))

# 2. Definicje
story.append(section(2, "Definicje"))
defs = [
    ("Program", "Program partnerski WB Trade Partners."),
    ("Partner", "Osoba uczestnicz\u0105ca w programie, posiadaj\u0105ca dost\u0119p do w\u0142asnego konta i linku partnerskiego."),
    ("Sprzeda\u017c w\u0142asna", "Sprzeda\u017c zrealizowana z wykorzystaniem w\u0142asnego linku partnerskiego partnera."),
    ("Struktura", "Uk\u0142ad partner\u00f3w rozwijaj\u0105cy si\u0119 pod danym partnerem."),
    ("Poziom struktury", "Pozycja danej osoby w d\u00f3\u0142 struktury wzgl\u0119dem konkretnego partnera."),
    ("Poziom programu / poziom kariery", "Status partnera w programie, okre\u015blaj\u0105cy jego zakres uprawnie\u0144, poziom prowizji zespo\u0142owych i premii liderów."),
    ("Linia", "Osoba bezpo\u015brednio zaproszona przez partnera oraz ca\u0142a struktura rozwijaj\u0105ca si\u0119 pod t\u0105 osob\u0105."),
    ("WL (Wolumen Linii)", "Obr\u00f3t wygenerowany przez dan\u0105 lini\u0119 zgodnie z zasadami programu."),
    ("Premia Lider\u00f3w", "Dodatkowe wynagrodzenie przypisane do poziomu programu partnera, zwi\u0105zane z rozwojem liderów w strukturze."),
    ("Saldo partnerskie", "\u0141\u0105czne saldo \u015brodk\u00f3w partnera, obejmuj\u0105ce prowizje, premie i dodatki, widoczne w panelu rozlicze\u0144."),
]
for term, definition in defs:
    story.append(p(f"<b>{term}</b><br/>{definition}"))

# 3. Zakres programu
story.append(section(3, "Zakres programu"))
story.append(p("1. Program WB Trade Partners opiera si\u0119 na trzech \u015bcie\u017ckach rozwoju: sprzeda\u017cy w\u0142asnej, rozwoju struktury oraz rozwoju liderów."))
story.append(p("2. Partner mo\u017ce rozwija\u0107 si\u0119 w programie poprzez: generowanie sprzeda\u017cy w\u0142asnej, budowanie aktywnej struktury, realizacj\u0119 warunk\u00f3w awansowych, osi\u0105ganie i potwierdzanie kolejnych poziom\u00f3w."))
story.append(p("3. Program przewiduje 7 poziom\u00f3w rozwoju."))

# 4. Prowizje podstawowe
story.append(section(4, "Prowizje podstawowe"))
story.append(p("Partnerowi przys\u0142uguje wynagrodzenie w nast\u0119puj\u0105cych wysoko\u015bciach:"))
story.append(table([
    ["\u017br\u00f3d\u0142o wynagrodzenia", "Stawka"],
    ["Sprzeda\u017c w\u0142asna z w\u0142asnego linku partnerskiego", "7%"],
    ["1. poziom zespo\u0142u", "2%"],
    ["2. poziom zespo\u0142u", "1,5%"],
    ["3. poziom zespo\u0142u", "1%"],
    ["4. poziom zespo\u0142u", "0,5%"],
], col_widths=[110 * mm, 40 * mm]))
story.append(PageBreak())

# 5. Poziomy programu
story.append(section(5, "Poziomy programu"))
story.append(p("Program sk\u0142ada si\u0119 z 7 poziom\u00f3w kariery, kt\u00f3re Partner osi\u0105ga poprzez realizacj\u0119 warunk\u00f3w "
               "awansowych okre\u015blonych w sekcji 10. Poziom kariery determinuje zakres uprawnie\u0144 Partnera w zakresie "
               "prowizji zespo\u0142owych oraz premii liderów. Wy\u017cszy poziom oznacza dost\u0119p do prowizji z wi\u0119kszej "
               "liczby poziom\u00f3w struktury oraz wy\u017csze stawki Premii Lider\u00f3w."))
story.append(table([
    ["Poziom", "Sprzeda\u017c w\u0142asna", "Zakres zespo\u0142u", "Premia Lider\u00f3w"],
    ["Poziom 1", "7%", "1 poziom", "\u2014"],
    ["Poziom 2", "7%", "1\u20132 poziom", "\u2014"],
    ["Poziom 3", "7%", "1\u20133 poziom", "0,25\u20130,50%"],
    ["Poziom 4", "7%", "1\u20134 poziom", "0,50\u20130,75%"],
    ["Poziom 5", "7%", "1\u20134 poziom", "0,75\u20131,00%"],
    ["Poziom 6", "7%", "1\u20134 poziom", "1,00\u20131,25%"],
    ["Poziom 7", "7%", "1\u20134 poziom", "1,25\u20131,50%"],
], col_widths=[30 * mm, 35 * mm, 40 * mm, 45 * mm]))
story.append(Paragraph("Zasada zakresu zespo\u0142u", h3))
story.append(p("Poziom programu okre\u015bla, z ilu poziom\u00f3w struktury partner mo\u017ce pobiera\u0107 prowizj\u0119 zesp\u00f3\u0142ow\u0105:"))
story.append(bullets([
    "Poziom 1 \u2014 1 poziom w d\u00f3\u0142",
    "Poziom 2 \u2014 2 poziomy w d\u00f3\u0142",
    "Poziom 3 \u2014 3 poziomy w d\u00f3\u0142",
    "Poziomy 4\u20137 \u2014 4 poziomy w d\u00f3\u0142",
]))

# 6. Premia Liderow
story.append(section(6, "Premia Lider\u00f3w"))
story.append(p("1. Premia Lider\u00f3w jest dodatkowym wynagrodzeniem przypisanym do poziomu programu partnera."))
story.append(p("2. Premia Lider\u00f3w przys\u0142uguje od Poziomu 3."))
story.append(p("3. Premia Lider\u00f3w mo\u017ce by\u0107 naliczana g\u0142\u0119biej ni\u017c prowizja zespo\u0142owa, zgodnie z zasadami programu."))
story.append(table([
    ["Poziom", "Premia bazowa", "Dodatek WL", "Maksymalnie"],
    ["Poziom 3", "0,25%", "+0,25%", "0,50%"],
    ["Poziom 4", "0,50%", "+0,25%", "0,75%"],
    ["Poziom 5", "0,75%", "+0,25%", "1,00%"],
    ["Poziom 6", "1,00%", "+0,25%", "1,25%"],
    ["Poziom 7", "1,25%", "+0,25%", "1,50%"],
], col_widths=[30 * mm, 35 * mm, 35 * mm, 35 * mm]))
story.append(p("1. Premia bazowa wynika z osi\u0105gni\u0119tego poziomu programu."))
story.append(p("2. Dodatek WL przys\u0142uguje wy\u0142\u0105cznie po spe\u0142nieniu warunku wolumenu linii."))
story.append(p("3. Je\u017celi linia nie spe\u0142nia warunku WL, partner zachowuje wy\u0142\u0105cznie premi\u0119 bazow\u0105."))
story.append(PageBreak())

# 7. WL - Wolumen Linii
story.append(section(7, "WL \u2014 Wolumen Linii"))
story.append(p("Wolumen Linii (WL) okre\u015bla miesi\u0119czny obr\u00f3t kwalifikacyjny wygenerowany przez dan\u0105 lini\u0119. "
               "Spe\u0142nienie warunku WL aktywuje dodatek do Premii Lider\u00f3w w wysoko\u015bci +0,25% dla kwalifikuj\u0105cych "
               "si\u0119 Partner\u00f3w. Obr\u00f3t jest liczony wy\u0142\u0105cznie zgodnie z zasadami okre\u015blonymi w sekcji 13. "
               "Poni\u017cej zestawienie obowi\u0105zuj\u0105cych progów WL."))
story.append(table([
    ["Skr\u00f3t", "Znaczenie"],
    ["WL10", "linia z obrotem min. 10 000 z\u0142 / mies."],
    ["WL25", "linia z obrotem min. 25 000 z\u0142 / mies."],
    ["WL50", "linia z obrotem min. 50 000 z\u0142 / mies."],
    ["WL100", "linia z obrotem min. 100 000 z\u0142 / mies."],
    ["WL250", "linia z obrotem min. 250 000 z\u0142 / mies."],
    ["WL500", "linia z obrotem min. 500 000 z\u0142 / mies."],
    ["WL1000", "linia z obrotem min. 1 000 000 z\u0142 / mies."],
], col_widths=[35 * mm, 100 * mm]))
story.append(Paragraph("WL dla pe\u0142nej Premii Lider\u00f3w", h3))
story.append(table([
    ["Poziom", "Premia bazowa", "Pe\u0142na premia", "Warunek WL"],
    ["Poziom 3", "0,25%", "0,50%", "WL25"],
    ["Poziom 4", "0,50%", "0,75%", "WL50"],
    ["Poziom 5", "0,75%", "1,00%", "WL100"],
    ["Poziom 6", "1,00%", "1,25%", "WL250"],
    ["Poziom 7", "1,25%", "1,50%", "WL500"],
], col_widths=[30 * mm, 35 * mm, 35 * mm, 35 * mm]))

# 8. Podzial tej samej premii
story.append(section(8, "Podzia\u0142 tej samej premii w jednej linii"))
story.append(p("1. Je\u017celi w jednej linii wyst\u0119puje kilka os\u00f3b z tym samym poziomem programu, przypisana pula "
               "tej samej premii nie mno\u017cy si\u0119."))
story.append(p("2. Pula dzieli si\u0119 w nast\u0119puj\u0105cy spos\u00f3b:"))
story.append(table([
    ["Pozycja osoby z tym samym poziomem w jednej linii", "Udzia\u0142"],
    ["Najbli\u017csza osoba", "60%"],
    ["Druga osoba wy\u017cej", "30%"],
    ["Trzecia osoba wy\u017cej", "10%"],
], col_widths=[110 * mm, 40 * mm]))
story.append(p("Dodatek WL +0,25% dzieli si\u0119 wy\u0142\u0105cznie mi\u0119dzy osoby z tym samym poziomem, kt\u00f3rych linia "
               "spe\u0142nia wymagany warunek WL."))

# 9. Laczenie prowizji
story.append(section(9, "\u0141\u0105czenie prowizji zespo\u0142owej i Premii Lider\u00f3w"))
story.append(p("Premia Lider\u00f3w jest naliczana r\u00f3wnolegle z prowizj\u0105 zespo\u0142ow\u0105 z tytu\u0142u tej samej transakcji "
               "w strukturze. \u0141\u0105czna stawka wynagrodzenia zale\u017cy od poziomu kariery Partnera oraz odleg\u0142o\u015bci "
               "miejsca sprzeda\u017cy w strukturze. Premia Lider\u00f3w mo\u017ce by\u0107 naliczana r\u00f3wnie\u017c g\u0142\u0119biej ni\u017c "
               "obowi\u0105zuj\u0105cy zakres prowizji zespo\u0142owej. Poni\u017cej przyk\u0142ady dla wybranych poziom\u00f3w kariery."))
story.append(Paragraph("Przyk\u0142ad \u2014 Poziom 3", h3))
story.append(table([
    ["Miejsce sprzeda\u017cy", "Prowizja zesp.", "Premia Lider\u00f3w", "Razem"],
    ["1. poziom", "2%", "0,25\u20130,50%", "2,25\u20132,50%"],
    ["2. poziom", "1,5%", "0,25\u20130,50%", "1,75\u20132,00%"],
    ["3. poziom", "1%", "0,25\u20130,50%", "1,25\u20131,50%"],
    ["G\u0142\u0119biej ni\u017c 3. poziom", "\u2014", "0,25\u20130,50%", "0,25\u20130,50%"],
], col_widths=[45 * mm, 30 * mm, 35 * mm, 40 * mm]))
story.append(Paragraph("Przyk\u0142ad \u2014 Poziom 7", h3))
story.append(table([
    ["Miejsce sprzeda\u017cy", "Prowizja zesp.", "Premia Lider\u00f3w", "Razem"],
    ["1. poziom", "2%", "1,25\u20131,50%", "3,25\u20133,50%"],
    ["2. poziom", "1,5%", "1,25\u20131,50%", "2,75\u20133,00%"],
    ["3. poziom", "1%", "1,25\u20131,50%", "2,25\u20132,50%"],
    ["4. poziom", "0,5%", "1,25\u20131,50%", "1,75\u20132,00%"],
    ["G\u0142\u0119biej ni\u017c 4. poziom", "\u2014", "1,25\u20131,50%", "1,25\u20131,50%"],
], col_widths=[45 * mm, 30 * mm, 35 * mm, 40 * mm]))
story.append(PageBreak())

# 10. Warunki awansu
story.append(section(10, "Warunki awansu"))
story.append(p("Awans na wy\u017cszy poziom nast\u0119puje po spe\u0142nieniu jednej z trzech \u015bcie\u017cek awansowych w danym "
               "miesi\u0105cu rozliczeniowym. Partner mo\u017ce realizowa\u0107 \u015bcie\u017ck\u0119 odpowiadaj\u0105c\u0105 jego modelowi "
               "dzia\u0142alno\u015bci: opart\u0105 na sprzeda\u017cy w\u0142asnej, modelu \u0142\u0105czonym lub rozwoju struktury. Wszystkie "
               "warunki dotycz\u0105 obrotu kwalifikacyjnego zgodnie z zasadami okre\u015blonymi w sekcji 13. Dodatkowe "
               "ograniczenia udzia\u0142u jednej linii okre\u015bla sekcja 11."))

advance_steps = [
    ("Poziom 1 \u2192 Poziom 2", [
        ["Sprzeda\u017c w\u0142asna", "Model \u0142\u0105czony", "Struktura"],
        ["20 000 z\u0142 / mies. sprzeda\u017cy w\u0142asnej", "8 000 z\u0142 w\u0142asnej sprzeda\u017cy + 30 000 z\u0142 z 1. poziomu", "60 000 z\u0142 z 1. poziomu + min. 3 linie WL10"],
    ]),
    ("Poziom 2 \u2192 Poziom 3", [
        ["Sprzeda\u017c w\u0142asna", "Model \u0142\u0105czony", "Struktura"],
        ["50 000 z\u0142 / mies. sprzeda\u017cy w\u0142asnej", "20 000 z\u0142 w\u0142asnej sprzeda\u017cy + 80 000 z\u0142 z 1\u20132 poziomu", "150 000 z\u0142 z 1\u20132 poz. + min. 4 linie WL25 + min. 1 osoba na Poz. 2 w osobnej linii"],
    ]),
    ("Poziom 3 \u2192 Poziom 4", [
        ["Sprzeda\u017c w\u0142asna", "Model \u0142\u0105czony", "Struktura"],
        ["120 000 z\u0142 / mies. sprzeda\u017cy w\u0142asnej", "40 000 z\u0142 w\u0142asnej sprzeda\u017cy + 250 000 z\u0142 obrotu struktury", "600 000 z\u0142 obrotu struktury + min. 5 linii WL50 + min. 2 osoby na Poz. 3 w osobnych liniach"],
    ]),
    ("Poziom 4 \u2192 Poziom 5", [
        ["Sprzeda\u017c w\u0142asna", "Model \u0142\u0105czony", "Struktura"],
        ["250 000 z\u0142 / mies. sprzeda\u017cy w\u0142asnej", "75 000 z\u0142 w\u0142asnej sprzeda\u017cy + 750 000 z\u0142 obrotu struktury", "1 500 000 z\u0142 obrotu struktury + min. 6 linii WL100 + min. 2 osoby na Poz. 4 w osobnych liniach"],
    ]),
    ("Poziom 5 \u2192 Poziom 6", [
        ["Sprzeda\u017c w\u0142asna", "Model \u0142\u0105czony", "Struktura"],
        ["500 000 z\u0142 / mies. sprzeda\u017cy w\u0142asnej", "150 000 z\u0142 w\u0142asnej sprzeda\u017cy + 1 500 000 z\u0142 obrotu struktury", "2 750 000 z\u0142 obrotu struktury + min. 7 linii WL250 + min. 2 osoby na Poz. 5 w osobnych liniach"],
    ]),
    ("Poziom 6 \u2192 Poziom 7", [
        ["Sprzeda\u017c w\u0142asna", "Model \u0142\u0105czony", "Struktura"],
        ["1 000 000 z\u0142 / mies. sprzeda\u017cy w\u0142asnej", "250 000 z\u0142 w\u0142asnej sprzeda\u017cy + 2 500 000 z\u0142 obrotu struktury", "4 000 000 z\u0142 obrotu struktury + min. 8 linii WL250 + min. 2 os. na Poz. 6 lub 4 os. na Poz. 5 w osobnych liniach"],
    ]),
]
for label, rows in advance_steps:
    story.append(Paragraph(label, h3))
    story.append(table(rows, col_widths=[45 * mm, 50 * mm, 55 * mm]))
story.append(PageBreak())

# 11. Maksymalny udzial jednej linii
story.append(section(11, "Maksymalny udzia\u0142 jednej linii przy awansie"))
story.append(p("W celu zapewnienia stabilno\u015bci i rzeczywistego zró\u017cnicowania struktury, przy ocenie warunk\u00f3w "
               "awansu obowi\u0105zuje limit udzia\u0142u pojedynczej linii w \u0142\u0105cznym obrocie kwalifikacyjnym. Im wy\u017cszy "
               "docelowy poziom, tym wy\u017csze wymagania dotycz\u0105ce szeroko\u015bci struktury. Przekroczenie limitu "
               "oznacza, \u017ce nadwy\u017ckowy obr\u00f3t z danej linii nie jest uwzgl\u0119dniany przy awansie."))
story.append(table([
    ["Awans na poziom", "Maksymalny udzia\u0142 jednej linii"],
    ["Poziom 2", "60%"],
    ["Poziom 3", "50%"],
    ["Poziom 4", "45%"],
    ["Poziom 5", "35%"],
    ["Poziom 6", "30%"],
    ["Poziom 7", "25%"],
], col_widths=[80 * mm, 70 * mm]))

# 12. Potwierdzanie i utrwalanie poziomu
story.append(section(12, "Potwierdzanie i utrwalanie poziomu"))
story.append(bullets([
    "Awans jest miesi\u0119czny.",
    "Po spe\u0142nieniu warunk\u00f3w partner przechodzi na kolejny poziom.",
    "W kolejnym okresie partner potwierdza wynik \u2014 poziom zostaje potwierdzony po raz pierwszy.",
    "Po dwukrotnym potwierdzeniu poziom zostaje utrwalony.",
    "Po utrwaleniu poziom staje si\u0119 minimalnym poziomem sta\u0142ym \u2014 partner zachowuje go niezale\u017cnie od wynik\u00f3w w kolejnych miesi\u0105cach.",
    "Partner mo\u017ce awansowa\u0107 dalej.",
    "Partner nie spada poni\u017cej utrwalonego poziomu.",
    "Dodatki WL zale\u017c\u0105 od bie\u017c\u0105cych wynik\u00f3w linii.",
    "Bie\u017c\u0105ce rozliczenia pozostaj\u0105 zale\u017cne od realnego obrotu miesi\u0105ca.",
]))

# 13. Zasady obrotu kwalifikacyjnego
story.append(section(13, "Zasady obrotu kwalifikacyjnego"))
story.append(p("Do prowizji, WL, premii i awans\u00f3w liczy si\u0119 wy\u0142\u0105cznie obr\u00f3t: op\u0142acony, dostarczony, "
               "niezwr\u00f3cony, z produkt\u00f3w obj\u0119tych programem (bez koszt\u00f3w dostawy). Zasada ta dotyczy sprzeda\u017cy "
               "w\u0142asnej, obrotu zespo\u0142u, obrotu struktury, WL oraz warunk\u00f3w awansu."))
story.append(bullets(["op\u0142acony", "dostarczony", "niezwr\u00f3cony", "z produkt\u00f3w obj\u0119tych programem", "bez koszt\u00f3w dostawy"]))

# 14. Saldo partnerskie
story.append(section(14, "Saldo partnerskie"))
story.append(p("1. Wszystkie prowizje, premie i dodatki trafiaj\u0105 do jednego salda partnerskiego."))
story.append(p("2. Szczeg\u00f3\u0142y rozlicze\u0144 s\u0105 widoczne w panelu rozlicze\u0144 partnera."))
story.append(p("3. Saldo partnerskie mo\u017ce by\u0107: wykorzystane na zakupy na stronie albo zlecone do wyp\u0142aty."))

# 15. Zasady blokady
story.append(section(15, "Zasady blokady i odblokowania prowizji"))
story.append(p("Naliczone prowizje podlegaj\u0105 tymczasowej blokadzie do czasu weryfikacji prawid\u0142owo\u015bci realizacji "
               "zam\u00f3wienia. Odblokowanie prowizji nast\u0119puje automatycznie po up\u0142ywie ustawowego okresu "
               "reklamacyjnego, o ile zam\u00f3wienie nie zosta\u0142o zwr\u00f3cone ani anulowane. Zablokowane prowizje s\u0105 "
               "widoczne na koncie Partnera, lecz nie mog\u0105 by\u0107 wyp\u0142acone ani wykorzystane do zakup\u00f3w."))
story.append(table([
    ["Etap zam\u00f3wienia", "Status prowizji"],
    ["Zam\u00f3wienie op\u0142acone", "prowizja oczekuj\u0105ca"],
    ["Zam\u00f3wienie dostarczone", "prowizja nadal zablokowana"],
    ["14 dni od dostawy bez zwrotu", "prowizja dost\u0119pna"],
    ["Zwrot lub anulowanie", "prowizja anulowana lub korygowana"],
], col_widths=[80 * mm, 70 * mm]))
story.append(PageBreak())

# 16. Zlecenie wyplaty
story.append(section(16, "Zlecenie wyp\u0142aty"))
story.append(p("1. Partner mo\u017ce zleci\u0107 wyp\u0142at\u0119 \u015brodk\u00f3w po ich odblokowaniu."))
story.append(p("2. Minimalna kwota zlecenia wyp\u0142aty wynosi <b>10 z\u0142</b>."))
story.append(p("3. Po zleceniu wyp\u0142ata nast\u0119puje w terminie do <b>2 dni roboczych</b>."))
story.append(p("4. Organizator zastrzega mo\u017cliwo\u015b\u0107 weryfikacji poprawno\u015bci naliczeń przed realizacj\u0105 wyp\u0142aty."))

# 17. Reklamacje
story.append(section(17, "Reklamacje i spory rozliczeniowe"))
story.append(p("1. Partner ma prawo zg\u0142osi\u0107 zastrze\u017cenia dotycz\u0105ce: naliczenia prowizji, statusu prowizji, "
               "awansu, przypisania WL, podzia\u0142u premii w strukturze."))
story.append(p("2. Zg\u0142oszenie nale\u017cy przekaza\u0107 na adres: <b>agencja@wb-horizon.pl</b>"))
story.append(p("3. W zg\u0142oszeniu partner powinien poda\u0107: dane identyfikacyjne, opis sprawy, numer zam\u00f3wienia lub "
               "okres rozliczeniowy."))
story.append(p("4. Organizator analizuje zg\u0142oszenie i udziela odpowiedzi w rozs\u0105dnym terminie operacyjnym."))
story.append(p("5. W przypadku sporu interpretacyjnego wi\u0105\u017c\u0105ca jest aktualna wersja programu oraz dane "
               "systemowe Organizatora."))

# 18. Zmiany programu
story.append(section(18, "Zmiany programu"))
story.append(p("1. Organizator zastrzega sobie prawo do aktualizacji zasad programu, poziom\u00f3w, warunk\u00f3w awansu, "
               "modelu rozlicze\u0144, zasad WL oraz zasad wyp\u0142at i salda."))
story.append(p("2. Aktualna wersja zasad programu powinna by\u0107 publikowana i komunikowana w spos\u00f3b przyj\u0119ty przez "
               "Organizatora."))
story.append(p("3. Zmiany nie naruszaj\u0105 praw nabytych partnera wynikaj\u0105cych z ju\u017c prawid\u0142owo naliczonych i "
               "odblokowanych \u015brodk\u00f3w, chyba \u017ce korekta wynika ze zwrotu, anulowania zam\u00f3wienia lub b\u0142\u0119du "
               "systemowego."))

# 19. Postanowienia koncowe
story.append(section(19, "Postanowienia ko\u0144cowe"))
story.append(p("1. Niniejszy dokument stanowi podstawowy regulamin programu WB Trade Partners."))
story.append(p("2. Partner uczestnicz\u0105cy w programie akceptuje zasady wynikaj\u0105ce z niniejszego regulaminu."))
story.append(p("3. W sprawach nieuregulowanych zastosowanie maj\u0105 przepisy prawa powszechnie obowi\u0105zuj\u0105cego oraz "
               "aktualne zasady organizacyjne programu publikowane przez Organizatora."))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "<b>WA\u017bNE</b><br/>W przypadku rozbie\u017cno\u015bci mi\u0119dzy tre\u015bci\u0105 Planu Marketingowego a niniejszym "
    "dokumentem, rozstrzygaj\u0105ce s\u0105 postanowienia Warunk\u00f3w Wsp\u00f3\u0142pracy.",
    ParagraphStyle("warn", parent=body, backColor=colors.HexColor("#fff4e5"), borderPadding=8),
))
story.append(Spacer(1, 20))
story.append(Paragraph(
    "WB Partners Sp. z o.o. &bull; ul. Juliusza S\u0142owackiego 24/11, 35-060 Rzesz\u00f3w &bull; NIP: 5170455185 &bull; "
    "REGON: 540735769 &bull; KRS: 0001151642<br/>agencja@wb-horizon.pl &bull; 570 038 828",
    small,
))


def build():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    doc = SimpleDocTemplate(
        OUT_PATH, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title="Warunki Wsp\u00f3\u0142pracy - Program Partnerski WB Trade",
        author="WB Partners Sp. z o.o.",
    )
    doc.build(story)
    print(f"Wygenerowano: {OUT_PATH}")


if __name__ == "__main__":
    build()
