#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

static vector<string> stringDefaultHeaders = { "value" };
vector<string>& stringParser::getDefaultHeaders() {
	return stringDefaultHeaders;
}

void stringParser::init(vector<string>& headers) {}

void* stringParser::createInstance() {
	return new string();
}

void stringParser::deleteInstance(void* obj) {
	delete (string*)obj;
}

string stringParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	string * ref = (string *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "value") { ss << (*ref) << "^"; }
		else { logUnkonwnField("string", headers[i]); }
	}
	return ss.str();
}

void stringParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	string * ref = (string *)obj;
	if (headers[index] == "value") { *ref = (string)value; }
	else { logUnkonwnField("string", headers[index]); }
}

