#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void calculationMandayParser::init(vector<string>& headers) {}


static vector<string> calculationMandayDefaultHeaders = { "id", "airline", "calculationManday", "description", "label", "type", 
"defaultLocation", "colorHex", "fixedDurationMin", "fixedStartTime", "fixedEndTime", "btPct", "creditPct",
"fdpPct", "dpPct", "isAdhoc", "isRecency", "isQualifier", "ftPct", "wpPct", "restTime", "lastModified", "modifiedBy", "id" };
vector<string>& calculationMandayParser::getDefaultHeaders() {
	return calculationMandayDefaultHeaders;
}

void* calculationMandayParser::createInstance() {
	return new CalculationManday();
}

void calculationMandayParser::deleteInstance(void* obj) {
	delete (CalculationManday*)obj;
}

string calculationMandayParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CalculationManday * ref = (CalculationManday *)obj;
	//"", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "str") { ss << ref->str << "^"; }
		else if (headers[i] == "end") { ss << ref->end << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("calculation_manday", headers[i]); }
	}
	return ss.str();
}

void calculationMandayParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CalculationManday * ref = (CalculationManday *)obj;

	if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "type") { ref->type = value; }
	else if (headers[index] == "str") { ref->str = value; }
	else if (headers[index] == "end") { ref->end = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("calculation_manday", headers[index]); }
}

