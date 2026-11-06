from pathlib import Path
import base64
import shutil
import zipfile
import sys

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "deliverables" / "coral-reef-beef-led-sign"
PUBLIC = ROOT / "public"
CORAL = "#F47C59"
BLUE = "#3756AA"


def make_svg() -> None:
    logo_data = base64.b64encode((PUBLIC / "coral-icon.png").read_bytes()).decode()
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="33in" height="33in" viewBox="0 0 3300 3300">
  <title>Coral Reef and Beef 33 inch LED sign layout guide</title>
  <desc>Provider layout guide. Rebuild text in the supplied Mounties Regular font, and convert all artwork to paths before fabrication.</desc>
  <style>@font-face {{ font-family: Mounties; src: url('mounties-regular.otf'); }}</style>
  <circle cx="1650" cy="1650" r="1600" fill="#ffffff" stroke="{BLUE}" stroke-width="28"/>
  <image x="975" y="310" width="1350" height="1350" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,{logo_data}"/>
  <path d="M660 1740 C1030 1540 1270 1915 1650 1740 S2290 1540 2640 1740" fill="none" stroke="{BLUE}" stroke-width="38" stroke-linecap="round"/>
  <path d="M700 1840 C1060 1645 1300 2015 1650 1840 S2250 1645 2600 1840" fill="none" stroke="{BLUE}" stroke-width="38" stroke-linecap="round"/>
  <path d="M740 1940 C1085 1755 1320 2115 1650 1940 S2215 1755 2560 1940" fill="none" stroke="{BLUE}" stroke-width="38" stroke-linecap="round"/>
  <text x="1650" y="2390" text-anchor="middle" fill="{BLUE}" font-family="Mounties, serif" font-size="510" font-weight="400" letter-spacing="8">CORAL</text>
  <text x="1650" y="2700" text-anchor="middle" fill="{BLUE}" font-family="Arial, sans-serif" font-size="150" font-weight="400" letter-spacing="44">REEF &amp; BEEF</text>
  <g fill="{BLUE}" font-family="Arial, sans-serif" font-size="60"><text x="110" y="140">OUTER DIAMETER 33 IN</text><text x="110" y="3220">All text must be rebuilt and outlined by fabricator using supplied font.</text></g>
</svg>'''
    (OUT / "coral-reef-beef-led-sign-layout-guide.svg").write_text(svg)


def draw_wrapped(c, text, x, y, width, font="Helvetica", size=9.2, leading=12):
    words = text.split()
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if c.stringWidth(candidate, font, size) <= width:
            line = candidate
        else:
            c.drawString(x, y, line)
            y -= leading
            line = word
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y


def build_pdf() -> None:
    path = OUT / "coral-reef-beef-led-sign-provider-brief.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter
    margin = 0.55 * inch
    c.setFillColor(white)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    c.setFillColor(HexColor(BLUE))
    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin, h - margin, "Coral Reef and Beef LED Sign")
    c.setFillColor(HexColor("#333333"))
    c.setFont("Helvetica", 9.5)
    c.drawString(margin, h - margin - 18, "Fabrication brief and artwork handoff")
    c.setStrokeColor(HexColor(CORAL)); c.setLineWidth(3)
    c.line(margin, h - margin - 28, w - margin, h - margin - 28)

    mockup = PUBLIC / "images" / "coral-reef-beef-neon-wall-mockup-thin-type.png"
    c.drawImage(ImageReader(str(mockup)), margin, h - 345, width=w - 2*margin, height=220, preserveAspectRatio=True, anchor='c', mask='auto')
    c.setFillColor(HexColor("#555555")); c.setFont("Helvetica-Oblique", 8)
    c.drawString(margin, h - 357, "Visual placement reference: sign centered on the 71 x 41 in wall. Cables shown in the original room photo are not part of the final installation.")

    y = h - 386
    c.setFillColor(HexColor(BLUE)); c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, "Build specification")
    y -= 16
    c.setFillColor(HexColor("#222222")); c.setFont("Helvetica", 9.2)
    specs = [
        ("Finished size", "33 in outer diameter circular sign"),
        ("Wall field", "71 in W x 41 in H; center sign at 35.5 in from either side and 20.5 in from the bottom"),
        ("Face", "Matte white circular acrylic backer, clearly edged from the wall"),
        ("Lighting", "LED neon flex or comparable low-voltage LED system, indoor rated; vendor to confirm transformer, wattage, and UL/ETL listing"),
        ("Mounting", "Four low-profile standoffs shown at 12, 3, 6, and 9 o'clock; conceal power feed behind the sign"),
        ("Artwork", "Use the enclosed logo PNG and Mounties Regular font. Fabricator must outline/convert text and provide a proof before production."),
    ]
    for label, value in specs:
        c.setFont("Helvetica-Bold", 9.2); c.drawString(margin, y, f"{label}:")
        c.setFont("Helvetica", 9.2); y = draw_wrapped(c, value, margin + 92, y, w - margin - (margin + 92)) - 3

    c.setFillColor(HexColor(BLUE)); c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y - 4, "Color and typography")
    y -= 22
    c.setFillColor(HexColor(CORAL)); c.circle(margin + 8, y + 3, 6, stroke=0, fill=1)
    c.setFillColor(HexColor("#222222")); c.setFont("Helvetica", 9.2)
    c.drawString(margin + 21, y, "Coral icon: soft salmon coral #F47C59")
    y -= 17
    c.setFillColor(HexColor(BLUE)); c.circle(margin + 8, y + 3, 6, stroke=0, fill=1)
    c.setFillColor(HexColor("#222222")); c.drawString(margin + 21, y, "CORAL, waves, outer ring, and REEF & BEEF: royal blue #3756AA")
    y -= 17
    c.drawString(margin + 21, y, "CORAL: Mounties Regular, thin strokes, no synthetic bold. REEF & BEEF: regular-weight uppercase sans with open spacing.")
    y -= 24

    c.setFillColor(HexColor(BLUE)); c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, "Vendor deliverables requested before fabrication")
    y -= 15
    c.setFillColor(HexColor("#222222")); c.setFont("Helvetica", 9.2)
    for item in ["Scaled production proof with tube paths and letter spacing", "Color/tube sample or material color confirmation", "Mounting template and standoff locations", "Electrical specification and power supply location", "Lead time, warranty, installation instructions, and freight quote"]:
        c.drawString(margin + 10, y, u"• " + item); y -= 13

    c.setFillColor(HexColor("#666666")); c.setFont("Helvetica-Oblique", 7.5)
    c.drawString(margin, 26, "Design intent only. The sign provider should verify mounting, wall condition, electrical work, and local code requirements before fabrication.")
    c.save()


def build_pdf_spanish() -> None:
    path = OUT / "coral-reef-beef-led-sign-provider-brief-es.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter
    margin = 0.55 * inch
    c.setFillColor(white); c.rect(0, 0, w, h, stroke=0, fill=1)
    c.setFillColor(HexColor(BLUE)); c.setFont("Helvetica-Bold", 20)
    c.drawString(margin, h - margin, "Letrero LED Coral Reef and Beef")
    c.setFillColor(HexColor("#333333")); c.setFont("Helvetica", 9.5)
    c.drawString(margin, h - margin - 18, "Especificacion de fabricacion y entrega de arte")
    c.setStrokeColor(HexColor(CORAL)); c.setLineWidth(3); c.line(margin, h - margin - 28, w - margin, h - margin - 28)
    mockup = PUBLIC / "images" / "coral-reef-beef-neon-wall-mockup-thin-type.png"
    c.drawImage(ImageReader(str(mockup)), margin, h - 345, width=w - 2*margin, height=220, preserveAspectRatio=True, anchor='c', mask='auto')
    c.setFillColor(HexColor("#555555")); c.setFont("Helvetica-Oblique", 8)
    c.drawString(margin, h - 357, "Referencia de ubicacion: letrero centrado en el muro de 71 x 41 pulgadas. Los cables de la foto original no forman parte de la instalacion final.")
    y = h - 386
    c.setFillColor(HexColor(BLUE)); c.setFont("Helvetica-Bold", 11); c.drawString(margin, y, "Especificacion de construccion"); y -= 16
    c.setFillColor(HexColor("#222222")); c.setFont("Helvetica", 9.2)
    specs = [
        ("Tamano final", "Letrero circular de 33 pulgadas de diametro exterior"),
        ("Area del muro", "71 pulgadas de ancho x 41 pulgadas de alto; centrar a 35.5 pulgadas de cada lado y 20.5 pulgadas desde la parte inferior"),
        ("Frente", "Placa circular de acrilico blanco mate, claramente delimitada del muro"),
        ("Iluminacion", "Neon LED flexible o sistema LED comparable de bajo voltaje para interior; el proveedor debe confirmar transformador, potencia y certificacion UL/ETL"),
        ("Montaje", "Cuatro separadores de perfil bajo a las 12, 3, 6 y 9 en punto; ocultar la alimentacion electrica detras del letrero"),
        ("Arte", "Usar el PNG de logo y la tipografia Mounties Regular incluidos. El fabricante debe convertir el texto a curvas y enviar una prueba antes de producir."),
    ]
    for label, value in specs:
        c.setFont("Helvetica-Bold", 9.2); c.drawString(margin, y, f"{label}:")
        c.setFont("Helvetica", 9.2); y = draw_wrapped(c, value, margin + 92, y, w - margin - (margin + 92)) - 3
    c.setFillColor(HexColor(BLUE)); c.setFont("Helvetica-Bold", 11); c.drawString(margin, y - 4, "Color y tipografia"); y -= 22
    c.setFillColor(HexColor(CORAL)); c.circle(margin + 8, y + 3, 6, stroke=0, fill=1)
    c.setFillColor(HexColor("#222222")); c.setFont("Helvetica", 9.2); c.drawString(margin + 21, y, "Icono de coral: coral salmon suave #F47C59"); y -= 17
    c.setFillColor(HexColor(BLUE)); c.circle(margin + 8, y + 3, 6, stroke=0, fill=1)
    c.setFillColor(HexColor("#222222")); c.drawString(margin + 21, y, "CORAL, olas, aro exterior y REEF & BEEF: azul real #3756AA"); y -= 17
    y = draw_wrapped(c, "CORAL: Mounties Regular, trazos delgados, sin negrita sintetica. REEF & BEEF: sans serif regular en mayusculas y con espaciado abierto.", margin + 21, y, w - margin - (margin + 21)) - 11
    c.setFillColor(HexColor("#666666")); c.setFont("Helvetica-Oblique", 7.5)
    c.drawString(margin, 26, "Diseno conceptual. El proveedor debe verificar montaje, condicion del muro, trabajo electrico y requisitos de codigo local antes de fabricar.")
    c.save()


def package() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_svg()
    build_pdf()
    shutil.copy2(PUBLIC / "images" / "coral-reef-beef-neon-wall-mockup-thin-type.png", OUT / "wall-placement-mockup.png")
    shutil.copy2(PUBLIC / "coral-icon.png", OUT / "official-coral-logo.png")
    shutil.copy2(PUBLIC / "fonts" / "mounties-regular.otf", OUT / "mounties-regular.otf")
    (OUT / "README.txt").write_text("CORAL REEF AND BEEF LED SIGN PROVIDER PACKAGE\n\nSend this folder to the sign provider. Use the PDF for the build brief and wall placement. Use the SVG as a scalable layout guide only. Rebuild and outline all lettering from mounties-regular.otf before production. official-coral-logo.png is the official supplied coral artwork. Confirm a scaled proof, materials, electrical requirements, and wall mounting plan before fabrication.\n")
    zip_path = ROOT / "deliverables" / "coral-reef-beef-led-sign-provider-package.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(OUT.iterdir()):
            zf.write(f, f.relative_to(OUT.parent))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "es":
        OUT.mkdir(parents=True, exist_ok=True)
        build_pdf_spanish()
    else:
        package()
