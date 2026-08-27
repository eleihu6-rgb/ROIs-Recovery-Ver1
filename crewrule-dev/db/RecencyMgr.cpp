
#include <algorithm>
#include <iostream>
#include <time.h>
#include "RecencyMgr.h"
#include "UtilFunc.h"

//hash/equal: crewId/dep/arv/fleet/role/actingRank
size_t RecencyHash::operator() (shared_ptr<CrewRecency> const& o) const
{
	size_t ret = 17;
	//ret += o->crewDateUtc * 31; //OP#994, crew_date加入key
	ret += hash<string>()(o->idcrew) * 31;
	ret += hash<string>()(o->depAirport) * 31;
	ret += hash<string>()(o->arvAirport) * 31;
	ret += hash<string>()(o->fleet) * 31;
	ret += hash<string>()(o->actingRank) * 31;
	ret += hash<string>()(o->role) * 31;
	return ret;
}
bool RecencyEqual::operator() (shared_ptr<CrewRecency> const& t1, shared_ptr<CrewRecency> const& t2) const {
	if (t1->idcrew == t2->idcrew && t1->depAirport == t2->depAirport && t1->arvAirport == t2->arvAirport && t1->fleet == t2->fleet && t1->actingRank == t2->actingRank && t1->role == t2->role) {
		return true;
	}
	else {
		return false;
	}
}

bool compareRecencyByUtc(shared_ptr<CrewRecency> const& i, shared_ptr<CrewRecency> const& j) {
	return i->crewDateUtc < j->crewDateUtc;
}

//init: 将list按crewId/hash分类放入 recencyMap
void RecencyMgr::initCrewRecency(vector<shared_ptr<CrewRecency>>& list) {
	for (auto& item : list) {
		addRecency(item);
	}
}

void RecencyMgr::initCrewFleetRecency(vector<shared_ptr<CrewFleetRecency>>& list) {
	for (auto& item : list)
		_crewFleetRecencyMap[item->crewId].push_back(item);
}

void RecencyMgr::initCrewPortRecency(vector<shared_ptr<CrewPortRecency>>& list) {
	for (auto& item : list)
		_crewPortRecencyMap[item->crewId].push_back(item);
}

//寻找分类 dep/arv/fleet/actingRank/role最新分类
//在分类中找到早于utc的最后(新)纪录
//return: -1=失败, other=成功找到time_t
time_t RecencyMgr::getLastestRecencyBeforeUtc(time_t utc, string crewId, string dep, string arv, string fleet, string actingRank, string role) {

	if (recencyMap.find(crewId) == recencyMap.end()) {
		return -1;
	}
	RecencyMapWithHashAndEqual& recencyOfCrew = recencyMap[crewId];

	//layer 2: find by hash crewId/dep/arv/fleet/role/actingRank
	shared_ptr<CrewRecency> item(new CrewRecency());
	item->idcrew = crewId;
	item->depAirport = dep;
	item->arvAirport = arv;
	item->fleet = fleet;
	item->actingRank = actingRank;
	item->role = role;
	item->crewDateUtc = utc;
	if (recencyOfCrew.find(item) == recencyOfCrew.end()) {
		return -1;
	}
	auto& recencyList = recencyOfCrew[item];
	//layer 3: find lastest recency before utc
	auto it = std::lower_bound(recencyList.begin(), recencyList.end(), item, compareRecencyByUtc);
	if (it == recencyList.begin()) {
		return -1;
	}
	else {
		it--;
		return (*it)->crewDateUtc;
	}
	
}

//add recency item
void RecencyMgr::addRecency(shared_ptr<CrewRecency>& item) {
	//layer 1: find by crewId
	string crewId = item->idcrew;
	if (recencyMap.find(crewId) == recencyMap.end()) {
		recencyMap.insert(make_pair(crewId, RecencyMapWithHashAndEqual()));
	}
	RecencyMapWithHashAndEqual& recencyOfCrew = recencyMap[crewId];
	//layer 2: find by hash crewId/dep/arv/fleet/role/actingRank
	if (recencyOfCrew.find(item) == recencyOfCrew.end()) {
		recencyOfCrew.insert(make_pair(item, vector<shared_ptr<CrewRecency>>()));
	}
	auto& recencyList = recencyOfCrew[item];
	//layer 3: find position by crewDateUtc and insert
	auto position = std::lower_bound(recencyList.begin(), recencyList.end(), item, compareRecencyByUtc);
	if (position != recencyList.end() && (*position)->crewDateUtc == item->crewDateUtc) {
		//already exist
	}
	else {
		recencyList.insert(position, item);
	}

	crewIndex[item->idcrew].push_back(item);
}

void RecencyMgr::removeRecency(time_t utc, string crewId, string dep, string arv, string fleet, string actingRank, string role) {

	if (recencyMap.find(crewId) == recencyMap.end()) {
		return;
	}
	RecencyMapWithHashAndEqual& recencyOfCrew = recencyMap[crewId];

	//layer 2: find by hash crewId/dep/arv/fleet/role/actingRank
	shared_ptr<CrewRecency> item(new CrewRecency());
	item->idcrew = crewId;
	item->depAirport = dep;
	item->arvAirport = arv;
	item->fleet = fleet;
	item->actingRank = actingRank;
	item->role = role;
	item->crewDateUtc = utc;
	if (recencyOfCrew.find(item) == recencyOfCrew.end()) {
		return;
	}
	auto& recencyList = recencyOfCrew[item];
	if (recencyList.empty()) {
		return;
	}
	//layer 3: find lastest recency before utc
	auto it = std::lower_bound(recencyList.begin(), recencyList.end(), item, compareRecencyByUtc);
	if ((*it)->crewDateUtc == utc) {
		recencyList.erase(it);
	}
	else if (it != recencyList.begin()) {
		it--;
		recencyList.erase(it);
	}
}
void RecencyMgr::removeRecencyNotInScenario(long long scenarioId) {
	for (auto& recencyOfCrew : recencyMap) {
		for (auto& recencyOfDepArvFleetRoleRank : recencyOfCrew.second) {
			auto& recencyList = recencyOfDepArvFleetRoleRank.second;
			for (int i = (int)recencyList.size() - 1; i >= 0; i--) {
				shared_ptr<CrewRecency> item = recencyList[i];
				if (item->scenarioId != scenarioId)
					recencyList.erase(recencyList.begin() + i);
			}
		}
	}
}
void RecencyMgr::removeRecencyByRoster(string crewId, long long rosterId) {
	if (recencyMap.find(crewId) == recencyMap.end())
		return;

	auto& recencyOfCrew = recencyMap[crewId];
	for (auto& recencyOfDepArvFleetRoleRank : recencyOfCrew) {
		auto& recencyList = recencyOfDepArvFleetRoleRank.second;
		for (int i = (int)recencyList.size() - 1; i >= 0; i--) {
			shared_ptr<CrewRecency> item = recencyList[i];
			if (item->rosterId == rosterId)
				recencyList.erase(recencyList.begin() + i);
		}
	}
}

//更新recency.roster_id，针对 editor-> save-> ruleSrv-> update_id
void RecencyMgr::updateRosterId(string crewId, long long oldId, long long newId) {
	if (recencyMap.find(crewId) == recencyMap.end())
		return;

	auto& recencyOfCrew = recencyMap[crewId];
	for (auto& recencyOfDepArvFleetRoleRank : recencyOfCrew) {
		auto& recencyList = recencyOfDepArvFleetRoleRank.second;
		for (int i = (int)recencyList.size() - 1; i >= 0; i--) {
			shared_ptr<CrewRecency> item = recencyList[i];
			if (item->rosterId == oldId)
				item->rosterId = newId;
		}
	}
}

map<string, RecencyMapWithHashAndEqual>& RecencyMgr::getRecencyMap() {
	return recencyMap;
}
void RecencyMgr::print() {
	cout << "-------- crew_recency ---------\n";
	for (auto& recencyOfCrew : recencyMap) {
		cout << "[" << recencyOfCrew.first << "]\n";
		for (auto& recencyOfDepArvFleetRoleRank : recencyOfCrew.second) {
			for (auto& item : recencyOfDepArvFleetRoleRank.second) {
				cout << "  "
					<< item->idcrew << " "
					<< utcToUtcString(item->crewDateUtc) << " "
					<< item->depAirport << " " << item->arvAirport << " "
					<< item->fleet << " " << item->actingRank << " " << item->role << endl;
			}
		}
	}
	cout << endl;
}

vector<shared_ptr<CrewRecency>> RecencyMgr::getByCrewId(string crewId) {
	if (crewIndex.find(crewId) == crewIndex.end())
		return vector<shared_ptr<CrewRecency>>();

	return crewIndex[crewId];
}

void CrewRecency::copy(CrewRecency* other) {
	scenarioId = other->scenarioId;
	idcrew = other->idcrew;
	crewDateUtc = other->crewDateUtc;
	crewDateLoc = other->crewDateLoc; //20180802 ain, mantis#3708
	depAirport = other->depAirport;
	arvAirport = other->arvAirport;
	operate = other->operate;
	status = other->status;
	fleet = other->fleet;
	approach = other->approach;
	unit = other->unit;
	times = other->times;
	role = other->role;
	actingRank = other->actingRank;
	rosterId = other->rosterId;
	trainingId = other->trainingId;
	remark = other->remark;
	iduser = other->iduser;
	tmst = other->tmst;
	type = other->type;
	code = other->code;
	effDt = other->effDt;
	expDt = other->expDt;
}

void CrewRecencyRules::copy(CrewRecencyRules* other) {
	id = other->id;
	recencyType = other->recencyType;
	qualification = other->qualification;
	qualExpDay = other->qualExpDay; //20180802 ain, mantis#3708
	assignments = other->assignments;
	attributes = other->attributes;
	minPtns = other->minPtns;
	space = other->space;
}

void CrewFleetRecency::copy(CrewFleetRecency* other) {
	id = other->id;
	crewId = other->crewId;
	fleetSpecific = other->fleetSpecific;
	effDt = other->effDt;
	expDt = other->expDt;
	acType = other->acType;
	fleetGrp = other->fleetGrp;
}

void CrewPortRecency::copy(CrewPortRecency* other) {
	id = other->id;
	crewId = other->crewId;
	qualification = other->qualification;
	airport = other->airport;
	effDt = other->effDt;
	expDt = other->expDt;
	lastModified = other->lastModified;
	modifiedBy = other->modifiedBy;
}
