# **App Name**: Invoice Insights

## Core Features:

- Invoice Upload: Web UI enabling users to upload invoice PDFs or images.
- Data Extraction: Utilize Google Cloud Document AI to extract key data (vendor, date, total, line items) from uploaded invoices.
- Invoice Summarization: Use Vertex AI, acting as a summarization tool, to generate plain-English summaries of invoice data.
- Invoice Dashboard: Dashboard displays a list of uploaded invoices with vendor, date, total amount, and summary insight.
- User Authentication: Firebase Authentication for secure user login.
- File storage: Storage to persist the user invoice documents

## Style Guidelines:

- Primary color: HSL(210, 70%, 50%) converted to RGB hex #3399FF, a bright and clean blue to inspire trust and clarity for financial data.
- Background color: HSL(210, 20%, 95%) converted to RGB hex #F0F8FF, a very light, desaturated blue for a calm and professional feel.
- Accent color: HSL(180, 60%, 40%) converted to RGB hex #33CCCC, a contrasting cyan to highlight key actions and summaries.
- Body text: 'PT Sans' (sans-serif) for readability and a modern look. Headline Text: 'Playfair' for elegance, high contrast thin-thick lines, and a high-end feel
- Simple, outline-style icons to represent different invoice categories and actions, ensuring clarity without clutter.
- Clean and structured layout with a focus on readability, using clear sections for invoice list and details.
- Subtle transitions and animations for a smooth user experience, such as fading in invoice summaries.