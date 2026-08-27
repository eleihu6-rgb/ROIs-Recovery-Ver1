#include <sstream>
#include "Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void optimizationNecessityParser::init(vector<string>& headers) {}


static vector<string> optimizationNecessityDefaultHeaders = { "id", "airline", "category", "division", "componentType", "function", "name", "necessity" };
vector<string>& optimizationNecessityParser::getDefaultHeaders() {
	return optimizationNecessityDefaultHeaders;
}

void* optimizationNecessityParser::createInstance() {
	return new csvOptimizationNecessity();
}

void optimizationNecessityParser::deleteInstance(void* obj) {
	delete (csvOptimizationNecessity*)obj;
}

string optimizationNecessityParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvOptimizationNecessity * ref = (csvOptimizationNecessity *)obj;
	//"id", "airline", "category", "division", "componentType", "function", "name", "necessity"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << ","; }
		else if (headers[i] == "airline") { ss << ref->airline << ","; }
		else if (headers[i] == "category") { ss << ref->category << ","; }
		else if (headers[i] == "division") { ss << ref->division << ","; }
		else if (headers[i] == "componentType") { ss << ref->componentType << ","; }
		else if (headers[i] == "function") { ss << ref->function << ","; }
		else if (headers[i] == "name") { ss << ref->name << ","; }
		else if (headers[i] == "necessity") { ss << ref->necessity << ","; }
		else { logUnkonwnField("optimization_necessity", headers[i]); }
	}
	return ss.str();
}

void optimizationNecessityParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvOptimizationNecessity * ref = (csvOptimizationNecessity *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "category") { ref->category = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "componentType") { ref->componentType = value; }
	else if (headers[index] == "function") { ref->function = atoi(value); }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "necessity") { ref->necessity = value; }
	else if (headers[index] == "filiale") { }
	else if (headers[index] == "lastModified") { }
	else if (headers[index] == "modifiedBy") { }
	else { logUnkonwnField("optimization_necessity", headers[index]); }
}

