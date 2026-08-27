#include <sstream>
#include <memory.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"
#include "../CrewMonthManday.h"

void crewMonthMandayParser::init(vector<string>& headers) {}

static vector<string> crewMonthMandayDefaultHeaders = { "crewId", "month", "blh", "fdp", "dp", "highPlateau"};
vector<string>& crewMonthMandayParser::getDefaultHeaders() {
    return crewMonthMandayDefaultHeaders;
}
void* crewMonthMandayParser::createInstance() {
    return new CrewMonthManday();
}

void crewMonthMandayParser::deleteInstance(void* obj) {
    delete (CrewMonthManday*)obj;
}

string crewMonthMandayParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
    CrewMonthManday * ref = (CrewMonthManday *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "month") { ss << ref->month << "^"; }
		else if (headers[i] == "blh") { ss << ref->blh << "^"; }
		else if (headers[i] == "fdp") { ss << ref->fdp << "^"; }
		else if (headers[i] == "dp") { ss << ref->dp << "^"; }
        else if (headers[i] == "highPlateau") { ss << ref->highPlateau << "^";}
        else { cout << "ERROR: invalid crew month manday data, unknown field '" << headers[i] << "'\n"; }
    }
	return ss.str();
}

void crewMonthMandayParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
    CrewMonthManday * ref = (CrewMonthManday *)obj;
	if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "month") { ref->month = value; }
	else if (headers[index] == "blh") { ref->blh = atoi(value); }
	else if (headers[index] == "fdp") { ref->fdp = atoi(value); }
	else if (headers[index] == "dp") { ref->dp = atoi(value); }
	else if (headers[index] == "highPlateau") { ref->highPlateau = atoi(value); }
    else { cout << "ERROR: invalid crew month manday data, unknown field '" << headers[index] << "'\n"; }

}

