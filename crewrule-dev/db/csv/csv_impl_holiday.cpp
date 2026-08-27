#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void holidayParser::init(vector<string>& headers) {}


static vector<string> holidayDefaultHeaders = { "id", "airline", "holiday", "country", "city", "mark", "doType", "strDt", "endDt",
"filiale", "lastModified", "modifiedBy" };
vector<string>& holidayParser::getDefaultHeaders() {
	return holidayDefaultHeaders;
}

void* holidayParser::createInstance() {
	return new Holiday;
}

void holidayParser::deleteInstance(void* obj) {
	delete (Holiday*)obj;
}

string holidayParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Holiday * ref = (Holiday *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "holiday") { ss << ref->holiday << "^"; }
		else if (headers[i] == "strDt") { ss << utcToUtcTzString(ref->strDt) << "^"; }
		else if (headers[i] == "endDt") { ss << utcToUtcTzString(ref->endDt) << "^"; }

		else if (headers[i] == "country") { ss << ref->country << "^"; }
		else if (headers[i] == "city") { ss << ref->city << "^"; }
		else if (headers[i] == "mark") { ss << ref->mark << "^"; }
		else if (headers[i] == "doType") { ss << ref->doType << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("holiday", headers[i]); }
	}
	return ss.str();
}

void holidayParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Holiday * ref = (Holiday *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""	
	if (headers[index] == "id") { ; }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "holiday") { ref->holiday = value; }
	else if (headers[index] == "strDt") { ref->strDt = utcStrToUtc(value); }
	else if (headers[index] == "endDt") { ref->endDt = utcStrToUtc(value); }
	else if (headers[index] == "country") { ref->country = value; }
	else if (headers[index] == "city") { ref->city = value; }
	else if (headers[index] == "mark") { ref->mark = value; }
	else if (headers[index] == "doType") { ref->doType = value; }
	else if (headers[index] == "filiale") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("holiday", headers[index]); }
}

