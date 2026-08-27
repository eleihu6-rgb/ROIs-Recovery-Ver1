#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void cityParser::init(vector<string>& headers) {}


static vector<string> cityDefaultHeaders = { "city", "cityName", "cityNativeName", "cityDesc", "country",
"lastModified", "modifiedBy","id" };
vector<string>& cityParser::getDefaultHeaders() {
	return cityDefaultHeaders;
}

void* cityParser::createInstance() {
	return new csvCity();
}

void cityParser::deleteInstance(void* obj) {
	delete (csvCity*)obj;
}

string cityParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvCity * ref = (csvCity *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "city") { ss << ref->city << "^"; }
		else if (headers[i] == "cityName") { ss << ref->cityName << "^"; }
		else if (headers[i] == "cityNativeName") { ss << ref->cityNativeName << "^"; }
		else if (headers[i] == "cityDesc") { ss << ref->cityDesc << "^"; }
		else if (headers[i] == "country") { ss << ref->country << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("city", headers[i]); }
	}
	return ss.str();
}

void cityParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvCity * ref = (csvCity *)obj;
	if (headers[index] == "city") { ref->city = value; }
	else if (headers[index] == "cityName") { ref->cityName = value; }
	else if (headers[index] == "cityNativeName") { ref->cityNativeName = value; }
	else if (headers[index] == "cityDesc") { ref->cityDesc = value; }
	else if (headers[index] == "country") { ref->country = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("city", headers[index]); }
}

