#include <sstream>
#include "RosterFlight.h"
#include "RosterFlightMgr.h"
#include "UtilFunc.h"

using namespace std;

void RosterFlightMgr::cleanup() {
	this->crewIndex.clear();
	this->flightIndex.clear();
	this->pairingIndex.clear();
}

//add
void RosterFlightMgr::add(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	addFltIndex(item);
	addCrewIndex(item);
	addPairingIndex(item);
}

void RosterFlightMgr::addForRosterOptimizer(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	addFltIndexForRosterOptimizer(item);
	addCrewIndexForRosterOptimizer(item);
	addPairingIndexForRosterOptimizer(item);
}
//add
void RosterFlightMgr::add(const vector<shared_ptr<RosterFlight>> &list) {
	for (auto& i : list) {
		remove(i->crewId, i->fltId, i->pairingId);
		add(i);
	}
}
//从mgr.index中移除目标, 并执行delete
void RosterFlightMgr::remove(const string& crewId, const long long fltId, const long long pairingId) {
	removeCrewIndex(crewId, fltId);
	removeFltIndex(crewId, fltId);
	removePairingIndex(crewId, pairingId);
}

void RosterFlightMgr::removeForRosterOptimizer(const string& crewId, const long long fltId, const long long pairingId) {
	removeCrewIndexForRosterOptimizer(crewId, fltId, pairingId);
	removeFltIndexForRosterOptimizer(crewId, fltId, pairingId);
	removePairingIndexForRosterOptimizer(crewId, fltId, pairingId);
}
//从mgr.index中移除目标, 并执行delete
void RosterFlightMgr::remove(const vector<shared_ptr<RosterFlight>>& list) {
	for (auto& i : list) {
		remove(i->crewId, i->fltId, i->pairingId);
	}
}
//add
void RosterFlightMgr::addByPairing(const std::string& crewId, const long long rosterId, const long long scenarioId, const Pairing* pairing, const string& actingRank, const string& position, const std::string& source, const string comments) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			string flightDt = utcToUtcDtString(s->getStartTimeLocSch());
			shared_ptr<RosterFlight> rf(new RosterFlight(
				s->getDBId(), rosterId, pairing->getDbId(), d->getDutyId(), scenarioId, crewId, 0, flightDt, s->getAssignment(), pairing->getDivision(), actingRank, "", "",comments, source));

			rf->activeRank = position;

			this->add(rf);
		}
	}
}

void RosterFlightMgr::addByPairingForRosterOptimizer(std::string crewId, long long rosterId, long long scenarioId, Pairing* pairing, string actingRank, string position, string comments) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			string flightDt = utcToUtcDtString(s->getStartTimeLocSch());
			shared_ptr<RosterFlight> rf(new RosterFlight(
				s->getDBId(), rosterId, pairing->getDbId(), d->getDutyId(), scenarioId, crewId, 0, flightDt, s->getAssignment(), pairing->getDivision(), actingRank, "", "",comments,""));

			rf->activeRank = position;
			rf->source = "CR";

			this->addForRosterOptimizer(rf);
		}
	}
}

void
RosterFlightMgr::addByPairingForRosterOptimizer(const std::string &crewId, const long long rosterId, const long long scenarioId,
												const Pairing *pairing, const std::string &actingRank,
												const std::string &activeRank, const std::string &position,
												const std::string &comments) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty *d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment *s = d->getSegment(j);
			string flightDt = utcToUtcDtString(s->getStartTimeLocSch());
			shared_ptr<RosterFlight> rf(new RosterFlight(
					s->getDBId(), rosterId, pairing->getDbId(), d->getDutyId(), scenarioId, crewId, 0, flightDt,
					s->getAssignment(), pairing->getDivision(), actingRank, "", "", comments, ""));

			rf->activeRank = activeRank;
			rf->position = position;
			rf->source = "CR";
			rf->tmResourceCode = s->getFlightNumber();

			this->addForRosterOptimizer(rf);
		}
	}
}

//从mgr.index中移除目标, 并执行delete
void RosterFlightMgr::removeByPairing(const std::string& crewId, const Pairing* pairing) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			this->remove(crewId, s->getDBId(), pairing->getDbId());
		}
	}

}

void RosterFlightMgr::removeByPairingForRosterOptimizer(const std::string& crewId, const Pairing* pairing) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			this->removeForRosterOptimizer(crewId, s->getDBId(), pairing->getDbId());
		}
	}

}
//
//get
//
shared_ptr<RosterFlight> RosterFlightMgr::get(const long long fltId, const string& crewId) {
	auto iterFlt = flightIndex.find(fltId);
	if (iterFlt == flightIndex.end())
		return NULL;

	auto& list = iterFlt->second;
	for (auto it = list.begin(); it != list.end(); it++) {
		if ((*it)->crewId == crewId) {
			return (*it);
		}
	}
	return NULL;
}
vector<shared_ptr<RosterFlight>> RosterFlightMgr::get(const long long fltId) {
	auto iterFlt = flightIndex.find(fltId);
	if (iterFlt == flightIndex.end())
		return vector<shared_ptr<RosterFlight>>();
	return iterFlt->second;
}

std::vector<shared_ptr<RosterFlight>> RosterFlightMgr::getByDivision(const long long fltId, const string& division) {
	auto rfs = get(fltId);
	if (division.empty()) {
		return rfs;
	}
	std::vector<shared_ptr<RosterFlight>> tmpRfs;
	for (auto& rf : rfs) {
		if (rf->division == division) {
			tmpRfs.push_back(rf);
		}
	}
	return tmpRfs;
}

vector<shared_ptr<RosterFlight>> RosterFlightMgr::get(const string& crewId) {
	auto iterCrew = crewIndex.find(crewId);
	if (iterCrew == crewIndex.end())
		return vector<shared_ptr<RosterFlight>>();
	return iterCrew->second;
}

vector<shared_ptr<RosterFlight>> RosterFlightMgr::getByPairingId(long long pairingId) {
	auto iterPair = pairingIndex.find(pairingId);
	if (iterPair == pairingIndex.end())
		return vector<shared_ptr<RosterFlight>>();
	return iterPair->second;
}

//
//index
//
void RosterFlightMgr::addCrewIndex(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	for (auto& rf : crewIndex[item->crewId]) {
		if (rf->fltId == item->fltId) {
			rf = item;
			return;
		}
	}
	crewIndex[item->crewId].push_back(item);
}
void RosterFlightMgr::addCrewIndexForRosterOptimizer(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	for (auto& rf : crewIndex[item->crewId]) {
		if (rf->fltId == item->fltId && rf->pairingId == item->pairingId) {
			rf = item;
			return;
		}
	}
	crewIndex[item->crewId].push_back(item);
}

void RosterFlightMgr::addPairingIndexForRosterOptimizer(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	for (auto& rf : pairingIndex[item->pairingId]) {
		if (rf->fltId == item->fltId && rf->crewId == item->crewId) {
			rf = item;
			return;
		}
	}
	pairingIndex[item->pairingId].push_back(item);
}

void RosterFlightMgr::addFltIndex(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	for (auto& rf : flightIndex[item->fltId]) {
		if (rf->crewId == item->crewId) {
			rf = item;
			return;
		}
	}
	flightIndex[item->fltId].push_back(item);
}
void RosterFlightMgr::addFltIndexForRosterOptimizer(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	for (auto& rf : flightIndex[item->fltId]) {
		if (rf->crewId == item->crewId && rf->pairingId == item->pairingId) {
			rf = item;
			return;
		}
	}
	flightIndex[item->fltId].push_back(item);
}

void RosterFlightMgr::addPairingIndex(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return;
	for (auto& rf : pairingIndex[item->pairingId]) {
		if (rf->fltId == item->fltId && rf->crewId == item->crewId) {
			rf = item;
			return;
		}
	}
	pairingIndex[item->pairingId].push_back(item);
}

void RosterFlightMgr::removeCrewIndex(const std::string& crewId, const long long fltId) {
	auto iterCrew = crewIndex.find(crewId);
	if (iterCrew == crewIndex.end())
		return;

	auto& list = iterCrew->second;
	for (auto it = list.begin(); it != list.end(); it++) {
		if ((*it)->fltId == fltId) {
			list.erase(it);
			break;
		}
	}
}
void RosterFlightMgr::removeCrewIndexForRosterOptimizer(const std::string& crewId, const long long fltId, const long long pairingId) {
	auto iterCrew = crewIndex.find(crewId);
	if (iterCrew == crewIndex.end())
		return;

	auto& list = iterCrew->second;
	for (auto it = list.begin(); it != list.end(); it++) {
		if ((*it)->fltId == fltId && (*it)->pairingId == pairingId) {
			list.erase(it);
			break;
		}
	}
}
void RosterFlightMgr::removeFltIndex(const std::string& crewId, const long long fltId) {
	auto iterFlt = flightIndex.find(fltId);
	if (iterFlt == flightIndex.end())
		return;

	auto& list = iterFlt->second;
	for (auto it = list.begin(); it != list.end(); it++) {
		if (crewId == (*it)->crewId) {
			it = list.erase(it);
			break;
		}
	}
}

void RosterFlightMgr::removePairingIndex(const std::string& crewId, const long long pairingId) {
	auto iterPair = pairingIndex.find(pairingId);
	if (iterPair == pairingIndex.end())
		return;

	auto& list = iterPair->second;
	for (auto it = list.begin(); it != list.end(); it++) {
		if (crewId == (*it)->crewId) {
			it = list.erase(it);
			break;
		}
	}
}

void RosterFlightMgr::removeFltIndexForRosterOptimizer(const std::string& crewId, const long long fltId, const long long pairingId) {
	auto iterFlt = flightIndex.find(fltId);
	if (iterFlt == flightIndex.end())
		return;

	auto& list = iterFlt->second;
	for (auto it = list.begin(); it != list.end(); it++) {
		if (crewId == (*it)->crewId && (*it)->pairingId == pairingId) {
			it = list.erase(it);
			break;
		}
	}
}

void RosterFlightMgr::removePairingIndexForRosterOptimizer(const std::string& crewId, const long long fltId, const long long pairingId) {
	auto iterPair = pairingIndex.find(pairingId);
	if (iterPair == pairingIndex.end())
		return;

	auto& list = iterPair->second;
	for (auto it = list.begin(); it != list.end(); it++) {
		if (crewId == (*it)->crewId && (*it)->fltId == fltId) {
			it = list.erase(it);
			break;
		}
	}
}

//
//key = flt_id + crew_id
//
string RosterFlightMgr::makeKey(const shared_ptr<RosterFlight>& item) {
	if (!item)
		return "";
	stringstream alloc;
	return makeKey(item->fltId, item->crewId, alloc);
}
string RosterFlightMgr::makeKey(const long long fltId, const string& crewId) {
	stringstream alloc;
	return makeKey(fltId, crewId, alloc);
}
string RosterFlightMgr::makeKey(const RosterFlight* item, stringstream& alloc) {
	if (!item)
		return "";
	return makeKey(item->fltId, item->crewId, alloc);
}
string RosterFlightMgr::makeKey(const long long fltId, const string& crewId, stringstream& alloc) {
	alloc.str("");
	alloc << fltId << "_" << crewId;
	return alloc.str();
}
//
//RosterFlight
//
bool RosterFlight::isSameFltCrew(const RosterFlight* o) {
	if (!o) return false;
	if (fltId != o->fltId) return false;
	if (crewId != o->crewId) return false;
	return true;
}

bool RosterFlight::isTrainingFlight() const {
	return !tmRole.empty();
}

RosterFlight::RosterFlight() {};
RosterFlight::RosterFlight(long long fltId,long long rosterId, long long pairingId, long long dutyId,long long scenarioId, std::string crewId, int seqOrder, std::string fltDt, std::string assignment, std::string division, std::string actingRank, std::string checkType, std::string tsflag, std::string comments,std::string source) {
	this->fltId = fltId;
	this->rosterId = rosterId;
	this->pairingId = pairingId;
	this->dutyId = dutyId;
	this->scenarioId = scenarioId;
	this->crewId = crewId;
	this->fltDt = fltDt;
	this->assignment = assignment;
	this->division = division;
	this->actingRank = actingRank;
	this->activeRank = activeRank;
	this->seqOrder = seqOrder;
	this->checkType = checkType;
	this->tsFlag = tsFlag;
	split(this->tsFlag.c_str(), '|', this->tsFlags);
	this->comments = comments;
	this->source = source;
	//this->pickupDtLoc = pickupDtLoc;
	//this->firstBriefDtLoc = firstBriefDtLoc;
	//this->secondBriefDtLoc = secondBriefDtLoc;
	//this->debriefDtLoc = debriefDtLoc;
	//this->dropoffDtLoc = dropoffDtLoc;
}

shared_ptr<RosterFlight> RosterFlightMgr::make(const Segment* seg, const string& crewId, const string& actingRank, const string& division) {
	shared_ptr<RosterFlight> item(new RosterFlight);
	item->crewId = crewId;
	item->fltId = seg->getDBId();
	item->division = division;
	item->actingRank = actingRank;
	item->assignment = seg->getAssignment();
	item->pairingId = seg->getPairingId();
	item->dutyId = seg->getDutyId();
	return item;
}

void RosterFlightMgr::updateBypairing(const string& crewId, const std::string& actingRank, const Pairing* oldPtn, const Pairing* newPtn) {
	if (!oldPtn || !newPtn ) {
		return;
	}
	map<long long, Segment*> oldFltIds;
	map<long long, Segment*> newFltIds;
	for (std::size_t i = 0; i < oldPtn->getNumDuties(); i++) {
		Duty* d = oldPtn->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			oldFltIds[s->getDBId()] = s;
		}
	}
	for (std::size_t i = 0; i < newPtn->getNumDuties(); i++) {
		Duty* d = newPtn->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment* s = d->getSegment(j);
			newFltIds[s->getDBId()] = s;
		}
	}
	//对比 flt: 删除
	for (auto& it : oldFltIds) {
		long long fltId = it.first;
		if (newFltIds.find(fltId) == newFltIds.end()) {
			this->remove(crewId, fltId, oldPtn->getDbId());
		}
	}
	//对比 flt：新增
	for (auto& it : newFltIds) {
		long long fltId = it.first;
		if (oldFltIds.find(fltId) == oldFltIds.end()) {
			this->add(make(it.second, crewId, actingRank, newPtn->getDivision()));
		}
	}

}

void RosterFlightMgr::updateSeqOrder(const std::string& crewId, const long long fltId, const long long pairingId, const int seqOrder) {
	auto flightIter = flightIndex.find(fltId);
	if (flightIter != flightIndex.end()) {
		auto& rfs = flightIter->second;
		for (auto& rf : rfs) {
			if (rf->crewId == crewId) {
				rf->seqOrder = seqOrder;
			}
		}
		flightIndex[fltId] = rfs;
	}

	auto crewIter = crewIndex.find(crewId);
	if (crewIter != crewIndex.end()) {
		auto& rfs = crewIter->second;
		for (auto& rf : rfs) {
			if (rf->fltId == fltId) {
				rf->seqOrder = seqOrder;
			}
		}
		crewIndex[crewId] = rfs;
	}

	auto pairingIter = pairingIndex.find(pairingId);
	if (pairingIter != pairingIndex.end()) {
		auto& rfs = pairingIter->second;
		for (auto& rf : rfs) {
			if (rf->fltId == fltId && rf->crewId == crewId) {
				rf->seqOrder = seqOrder;
			}
		}
		pairingIndex[pairingId] = rfs;
	}
}

void RosterFlightMgr::updateFlightId(const long long oldId, const long long newId) {
	auto iter = flightIndex.find(oldId);
	if (iter != flightIndex.end()) {
		auto& rfs = iter->second;
		for (auto& rf : rfs) {
			rf->fltId = newId;
		}

		flightIndex[newId] = rfs;
		flightIndex.erase(oldId);
	}
}

void RosterFlightMgr::updateProgramCourseId(const long long oldId, const long long newId) {
	for (auto& pair : flightIndex) {
		auto& rfs = pair.second;
		for (auto& rf : rfs) {
			if (rf->tmProgramCourseId == oldId) {
				rf->tmProgramCourseId = newId;
			}

			if (rf->subTmProgramCourseId == oldId) {
				rf->subTmProgramCourseId = newId;
			}
		}
	}
}

std::size_t RosterFlightMgr::size() {
	std::size_t count = 0;
	for (auto& it : this->crewIndex) {
		count += it.second.size();
	}
	return count;
}

void RosterFlightMgr::log(const string& crewId) {
	auto iterCrew = crewIndex.find(crewId);
	if (iterCrew == crewIndex.end()) {
		return;
	}
	for (auto& it : iterCrew->second) {
		cout << "**DBG rosterFlt crew=" << it->crewId
			<< " flt=" << it->fltId
			<< " dt=" << it->fltDt
			<< " ptn=" << it->pairingId
			<< " assign=" << it->assignment
			<< " actRank=" << it->actingRank
			<< " tsFlag=" << it->tsFlag
			<< endl;
	}
}

void
RosterFlightMgr::addByPairing(const std::string& crewId, const long long rosterId, const long long scenarioId, const Pairing *pairing,
	const string& actingRank, const string& activeRank, const string& position, const std::string& source,
	const string& comments) {
	if (!pairing)
		return;
	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty *d = pairing->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment *s = d->getSegment(j);
			string flightDt = utcToUtcDtString(s->getStartTimeLocSch());
			shared_ptr<RosterFlight> rf(new RosterFlight(
					s->getDBId(), rosterId, pairing->getDbId(), d->getDutyId(), scenarioId, crewId, 0, flightDt,
					s->getAssignment(), pairing->getDivision(), actingRank, "", "", comments, source));

			rf->activeRank = activeRank;
			rf->position = position;

			this->add(rf);
		}
	}
}
