#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void flightAttributeParser::init(vector<string>& headers) {}


string flightAttributeParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvFlightAttribute * ref = (csvFlightAttribute *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "schId") { ss << ref->schId << "^"; }
		else if (headers[i] == "fltId") { ss << ref->fltId << "^"; }
		else if (headers[i] == "attrId") { ss << ref->attrId << "^"; }
		else { logUnkonwnField("flight_attribute", headers[i]); }
	}
	return ss.str();
}

void flightAttributeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvFlightAttribute * ref = (csvFlightAttribute *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "schId") { ref->schId = atoll(value); }
	else if (headers[index] == "fltId") { ref->fltId = atoll(value); }
	else if (headers[index] == "attrId") { ref->attrId = atoll(value); }
	else { logUnkonwnField("flight_attribute", headers[index]); }

}

void* flightAttributeParser::createInstance() {
	return new csvFlightAttribute();
}

void flightAttributeParser::deleteInstance(void* obj) {
	delete (csvFlightAttribute*)obj;
}

static vector<string> flightAttributeDefaultHeaders = { "id", "fltId", "schId", "attrId" };
vector<string>& flightAttributeParser::getDefaultHeaders() {
	return flightAttributeDefaultHeaders;
}