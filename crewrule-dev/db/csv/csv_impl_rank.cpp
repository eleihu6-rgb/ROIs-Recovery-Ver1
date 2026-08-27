#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rankParser::init(vector<string>& headers) {}


static vector<string> rankDefaultHeaders = { "id", "airline", "rank", "division", "displayOrder", "description", 
"isIncludeInFt", "lastModified", "modifiedBy","isCrewRank","isActingRank" };
vector<string>& rankParser::getDefaultHeaders() {
	return rankDefaultHeaders;
}

void* rankParser::createInstance() {
	return new RANK();
}

void rankParser::deleteInstance(void* obj) {
	delete (RANK*)obj;
}

string rankParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RANK * ref = (RANK *)obj;
	//"id", "airline", "rank", "", "", "description"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->rankId << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "displayOrder") { ss << ref->displayOrder << "^"; }
		else if (headers[i] == "description") { ss << "^"; }
		else if (headers[i] == "isIncludeInFt") { ss << ref->isIncludeInFt << "^"; }
		else if (headers[i] == "rankId") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "isCrewRank") { ss << "^"; }
		else if (headers[i] == "isActingRank") { ss << "^"; }
		else { logUnkonwnField("rank", headers[i]); }
	}
	return ss.str();
}

void rankParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RANK * ref = (RANK *)obj;
	if (headers[index] == "id") { ref->rankId = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "rank") { ref->rank = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "displayOrder") { ref->displayOrder = atoi(value); }
	else if (headers[index] == "description") {}
	else if (headers[index] == "isIncludeInFt") { ref->isIncludeInFt = (0 == strncmp(value, "true", 4)); }
	else if (headers[index] == "rankId") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "isCrewRank") { ref->isCrewRank = (0 == strncmp(value, "true", 4)); }
	else if (headers[index] == "isActingRank") { ref->isActingRank = (0 == strncmp(value, "true", 4)); }
	else if (headers[index] == "isMustCrewRank") { ref->isMustCrewRank = (0 == strncmp(value, "true", 4)); }
	else { logUnkonwnField("rank", headers[index]); }
}

