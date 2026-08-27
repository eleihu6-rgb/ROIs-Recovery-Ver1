#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void baseParser::init(vector<string>& headers) {}


static vector<string> baseDefaultHeaders = { "id", "airline", "base", "name", "displayOrder", "isPrimeDisplayBase", "lastModified", "modifiedBy", "filiale" };
vector<string>& baseParser::getDefaultHeaders() {
	return baseDefaultHeaders;
}

void* baseParser::createInstance() {
	return new BASE();
}

void baseParser::deleteInstance(void* obj) {
	delete (BASE*)obj;
}

string baseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	BASE * ref = (BASE *)obj;
	//"", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->baseId<< "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "base") { ss << ref->base << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "displayOrder") { ss << ref->displayOrder << "^"; }
		else if (headers[i] == "isPrimeDisplayBase") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else { logUnkonwnField("base", headers[i]); }
	}
	return ss.str();
}

void baseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	BASE * ref = (BASE *)obj;
	if (headers[index] == "id") { ref->baseId = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "base") { ref->base = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "displayOrder") { ref->displayOrder = atoi(value); }
	else if (headers[index] == "isPrimeDisplayBase") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") { ref->airline = value; }

	else { logUnkonwnField("base", headers[index]); }
}

