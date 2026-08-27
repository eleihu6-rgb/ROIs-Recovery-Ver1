#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void airportParser::init(vector<string>& headers) {}


static vector<string> airportDefaultHeaders = { "airport", "airportName", "plateauType", "airportNativeName", "airport4code",
"airportAbbr", "city", "category", "dir", "zoneId", "utcStandardOffset", "dstGrp", "country", "rnp", "cats",
 "lastModified", "modifiedBy" ,"airportIcao","icRoute", "longitude", "latitude"};
vector<string>& airportParser::getDefaultHeaders() {
	return airportDefaultHeaders;
}

void* airportParser::createInstance() {
	return new DBAirport();
}

void airportParser::deleteInstance(void* obj) {
	delete (DBAirport*)obj;
}

string airportParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DBAirport * ref = (DBAirport *)obj;
	//"id", "airport", "airportName", "airportNativeName", "airport4code", "airportAbbr", "city", "cityName", "cityNativeName", "category", "dir", "zoneId"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "airport") { ss << ref->airport << "^"; }
		else if (headers[i] == "airportName") { ss << ref->airportName << "^"; }
		else if (headers[i] == "airportNativeName") { ss << ref->airportNativeName << "^"; }
		else if (headers[i] == "airport4code") { ss << ref->airportICAO << "^"; }
		else if (headers[i] == "airportAbbr") { ss << ref->airportABBR << "^"; }
		else if (headers[i] == "city") { ss << ref->city << "^"; }
		else if (headers[i] == "cityName") { ss << ref->cityName << "^"; }
		else if (headers[i] == "cityNativeName") { ss << ref->cityNativeName << "^"; }
		else if (headers[i] == "category") { ss << ref->category << "^"; }
		else if (headers[i] == "dir") { ss << ref->dir << "^"; }
		else if (headers[i] == "zoneId") { ss << "^"; }
		else if (headers[i] == "utcStandardOffset") { ss << ref->utcOffsetMinutes << "^"; }
		else if (headers[i] == "dstGrp") { ss << ref->dstGrp << "^"; }
		else if (headers[i] == "country") { ss << ref->country << "^"; }
		else if (headers[i] == "plateauType") { ss << ref->plateauType << "^"; }
		else if (headers[i] == "rnp") { ss << ref->rnp << "^"; }
		else if (headers[i] == "cats") { ss << ref->cats << "^"; }
		else if (headers[i] == "latitude") { ss << ref->latitude << "^"; }
		else if (headers[i] == "longitude") { ss << ref->longitude << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "airportIcao") { ss << "^"; }
		else if (headers[i] == "icRoute") { ss << ref->icRoute << "^"; }
		else { logUnkonwnField("airport", headers[i]); }
	}
	return ss.str();
}

void airportParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DBAirport * ref = (DBAirport *)obj;
	if (headers[index] == "id") { }
	else if (headers[index] == "airport") { strncpy(ref->airport, value, sizeof(ref->airport) - 1); }
	else if (headers[index] == "airportName") { strncpy(ref->airportName, value, sizeof(ref->airportName) - 1); }
	else if (headers[index] == "airportNativeName") { strncpy(ref->airportNativeName, value, sizeof(ref->airportNativeName) - 1); }
	else if (headers[index] == "airport4code") { strncpy(ref->airportICAO, value, sizeof(ref->airportICAO) - 1); }
	else if (headers[index] == "airportAbbr") { strncpy(ref->airportABBR, value, sizeof(ref->airportABBR) - 1); }
	else if (headers[index] == "city") { strncpy(ref->city, value, sizeof(ref->city) - 1); }
	else if (headers[index] == "cityName") { strncpy(ref->cityName, value, sizeof(ref->cityName) - 1); }
	else if (headers[index] == "cityNativeName") { strncpy(ref->cityNativeName, value, sizeof(ref->cityNativeName) - 1); }
	else if (headers[index] == "category") { ref->category = value; }
	else if (headers[index] == "dir") { strncpy(ref->dir,value, sizeof(ref->dir) - 1); }
	else if (headers[index] == "zoneId") { strncpy(ref->zoneId, value, sizeof(ref->zoneId) - 1); }
	else if (headers[index] == "utcStandardOffset") { ref->utcOffsetMinutes = atoi(value); }
	else if (headers[index] == "dstGrp") { strncpy(ref->dstGrp, value, sizeof(ref->dstGrp)); }
	else if (headers[index] == "country") { strncpy(ref->country, value, sizeof(ref->country)); }
	else if (headers[index] == "plateauType") { strncpy(ref->plateauType, value, sizeof(ref->plateauType)); }
	else if (headers[index] == "rnp") { ref->rnp = value; }
	else if (headers[index] == "cats") { ref->cats = value; }
	else if (headers[index] == "icRoute") { ref->icRoute = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "airportIcao") { }
	else if (headers[index] == "latitude") { ref->latitude = atof(value); }
	else if (headers[index] == "longitude") { ref->longitude = atof(value); }
	else if (headers[index] == "inPhone") {}
	else if (headers[index] == "outPhone") {}
	else if (headers[index] == "state") {}
	else if (headers[index] == "countryName") {}
	else if (headers[index] == "email") {}
	else { logUnkonwnField("airport", headers[index]); }
}

