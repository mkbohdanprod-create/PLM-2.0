// Utility for geocoding addresses
// We use Nominatim (OpenStreetMap) as a free alternative to LocationIQ for the MVP.
// To switch to LocationIQ, just change the base URL and append `&key=YOUR_API_KEY`.

export async function geocodeAddress(city: string, street: string, building: string): Promise<{ lat: number, lng: number } | null> {
  try {
    const query = `${street} ${building}, ${city}, Ukraine`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'uk',
        // Nominatim requires a User-Agent
        'User-Agent': 'PLM-Dispatcher-App/1.0'
      }
    });

    if (!response.ok) {
      console.error('Geocoding failed with status', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon) // Nominatim returns 'lon'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error during geocoding:', error);
    return null;
  }
}
