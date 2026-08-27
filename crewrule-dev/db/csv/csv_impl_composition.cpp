#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void compositionParser::init(vector<string>& headers) {}


string compositionParser::toCsv(vector<string>& headers, void* obj) {
	//"", "", "", "", "", "", ""
	stringstream ss;
	csvComposition * ref = (csvComposition *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "nameDesc") { ss << ref->nameDesc << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "displayOrder") { ss << ref->displayOrder<< "^"; }
		else if (headers[i] == "hierarchy") { ss << ref->hirarchy << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else { logUnkonwnField("composition", headers[i]); }
	}
	return ss.str();
}

void compositionParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvComposition * ref = (csvComposition *)obj;
	if (headers[index] == "id") { ref->compId = atoll(value); }
	else if (headers[index] == "airline") {ref->airline = value; }
	else if (headers[index] == "filiale") { ref->airline = value; }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "nameDesc") { ref->nameDesc = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "displayOrder") { ref->displayOrder = atoi(value); }
	else if (headers[index] == "hierarchy") { ref->hirarchy = atoi(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") {}
	else { logUnkonwnField("composition", headers[index]); }
}

void* compositionParser::createInstance() {
	return new csvComposition();
}

void compositionParser::deleteInstance(void* obj) {
	delete (csvComposition*)obj;
}

static vector<string> compositionDefaultHeaders = { "id", "airline", "name", "nameDesc", "division", "displayOrder", "hierarchy",
"lastModified", "modifiedBy", "filiale"};
vector<string>& compositionParser::getDefaultHeaders() {
	return compositionDefaultHeaders;
}