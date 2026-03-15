import json, os , tempfile
from plugins.little import send_pdf_to_gemini, extract_images_from_pdf, prompt

def pdf_to_cbt(pdf_file):
    tmp_dir = tempfile.mkdtemp()
    pdf_path = os.path.join(tmp_dir, 'upload.pdf')
    pdf_file.save(pdf_path)
    raw_response = send_pdf_to_gemini(pdf_path, prompt)
    exam_data = json.loads(raw_response)
    image_coordinates = exam_data.pop('image_coordinates', [])
    images_dir = os.path.join(tmp_dir, 'images')
    extracted_files = extract_images_from_pdf(pdf_path, images_dir, image_coordinates)
    return {
        'exam_data': exam_data,
        'images_dir': images_dir,
        'tmp_dir': tmp_dir,
        'extracted_files': extracted_files
    }