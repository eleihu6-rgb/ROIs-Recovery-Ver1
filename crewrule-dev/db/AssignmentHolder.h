#ifndef ASSIGNMENT_HOLDER_H
#define ASSIGNMENT_HOLDER_H

#include <map>
#include <string>
#include "CrewDB.h"

class AssignmentHolder {
public:
	static AssignmentHolder& getInst();
	static string getAirline();
	static void getAirline(string v);
	std::size_t size();
	void add(ASSIGNMENT& item);
	ASSIGNMENT* getByName(std::string name);//return null if not exist
private:
	std::map<std::string, ASSIGNMENT> nameMap;
};


#endif//ASSIGNMENT_HOLDER_H