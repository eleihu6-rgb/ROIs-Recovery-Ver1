#include "AssignmentHolder.h"

using namespace std;

//singleton
static AssignmentHolder assignmentHolder;
AssignmentHolder& AssignmentHolder::getInst() {
	return assignmentHolder;
}

static string _airline;
string AssignmentHolder::getAirline() {
	return _airline;
}
void AssignmentHolder::getAirline(string v) {
	_airline = v;
}

//size
std::size_t AssignmentHolder::size() {
	return this->nameMap.size();
}

//赋值对象副本
void AssignmentHolder::add(ASSIGNMENT& item) {
	if (nameMap.find(item.assignment) == nameMap.end()) {
		nameMap[item.assignment] = item;
	}
}

//byName
ASSIGNMENT* AssignmentHolder::getByName(std::string name) {
	if (nameMap.find(name) == nameMap.end()) {
		return NULL;
	}
	else {
		return &nameMap[name];
	}
}

