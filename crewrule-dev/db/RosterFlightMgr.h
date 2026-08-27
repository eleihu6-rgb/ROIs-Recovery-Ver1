/**
1 RosterFlight����
2 RosterFlightMgr,ά��rosterFlight����,ά�� crew/flt����
*/
#ifndef ROSTER_FLIGHT_MGR_H
#define ROSTER_FLIGHT_MGR_H
#include <string>
//#include <memory>
#include <map>
//#include <vector>
#include <list>
#include <sstream>
#include "RosterFlight.h"
#include "Pairing.h"

class CrewDataContext;
//
//mgr
class RosterFlightMgr {
	friend class CrewDataContext;
public:
	void cleanup();
	void add(const shared_ptr<RosterFlight>& item);
	void addForRosterOptimizer(const shared_ptr<RosterFlight>& item);
	void add(const std::vector<shared_ptr<RosterFlight>>& list);
	void remove(const std::string& crewId, const long long fltId, const long long pairingId = -1);
	void removeForRosterOptimizer(const std::string& crewId, const long long fltId, const long long pairingId);
	void remove(const std::vector<shared_ptr<RosterFlight>>& list);

	void addByPairing(const std::string& crewId, const long long rosterId, const long long scenarioId, const Pairing* pairing, const string& actingRank, const string& position, const std::string& source, const string comments = NULL);
	void addByPairingForRosterOptimizer(std::string crewId, long long rosterId, long long scenarioId, Pairing* pairing, string actingRank, string position, string comments = NULL);
	void addByPairing(const std::string& crewId, const long long rosterId, const long long scenarioId, const Pairing* pairing, const string& actingRank, const string& activeRank, const string& position, const std::string& source, const string& comments);
	void addByPairingForRosterOptimizer(const std::string& crewId, const long long rosterId, const long long scenarioId, const Pairing* pairing, const string& actingRank, const string& activeRank, const string& position,const string& comments = NULL);
	void removeByPairing(const std::string& crewId, const Pairing* pairing);
	void removeByPairingForRosterOptimizer(const std::string& crewId, const Pairing* pairing);
	void updateBypairing(const std::string& crewId, const std::string& actingRank, const Pairing* oldPtn, const Pairing* newPtn);

	void updateFlightId(const long long oldId, const long long newId);

	void updateProgramCourseId(const long long oldId, const long long newId);

	shared_ptr<RosterFlight> get(const long long fltId, const std::string& crewId);
	std::vector<shared_ptr<RosterFlight>> get(const long long fltId);
	std::vector<shared_ptr<RosterFlight>> getByDivision(const long long fltId, const string& division);
	std::vector<shared_ptr<RosterFlight>> get(const std::string& crewId);
	std::vector<shared_ptr<RosterFlight>> getByPairingId(const long long pairingId);

	shared_ptr<RosterFlight> make(const Segment* seg, const string& crewId, const string& actingRank, const string& division);

	void updateSeqOrder(const std::string& crewId, const long long fltId, const long long pairingId, const int seqOrder);

	std::size_t size();
	void log(const string& crewId);

private:
	std::string makeKey(const shared_ptr<RosterFlight>& item);
	std::string makeKey(const long long fltId, const std::string& crewId);
	std::string makeKey(const RosterFlight* item, std::stringstream& alloc);
	std::string makeKey(const long long fltId, const std::string& crewId, std::stringstream& alloc);
	void addCrewIndex(const shared_ptr<RosterFlight>& item);
	void addFltIndex(const shared_ptr<RosterFlight>& item);
	void addPairingIndex(const shared_ptr<RosterFlight>& item);
	void addCrewIndexForRosterOptimizer(const shared_ptr<RosterFlight>& item);
	void addFltIndexForRosterOptimizer(const shared_ptr<RosterFlight>& item);
	void addPairingIndexForRosterOptimizer(const shared_ptr<RosterFlight>& item);
	void removeCrewIndex(const std::string& crewId, const long long fltId);
	void removeFltIndex(const std::string& crewId, const long long fltId);
	void removePairingIndex(const std::string& crewId, const long long pairingId);
	void removeCrewIndexForRosterOptimizer(const std::string& crewId, const long long fltId, const long long pairingId);
	void removeFltIndexForRosterOptimizer(const std::string& crewId, const long long fltId, const long long pairingId);
	void removePairingIndexForRosterOptimizer(const std::string& crewId, const long long fltId, const long long pairingId);

	std::unordered_map<std::string, std::vector<shared_ptr<RosterFlight>>> crewIndex;// key: crew_id
	std::unordered_map<long long, std::vector<shared_ptr<RosterFlight>>> flightIndex;// key: flt_id
	std::unordered_map<long long, std::vector<shared_ptr<RosterFlight>>> pairingIndex;// key: pairing_id
};

#endif//ROSTER_FLIGHT_MGR_H