/**
 * @file CheckGenderOnFlightByCompositionForPRRuleParamParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CHECKGENDERONFLIGHTBYCOMPOSITIONFORPRRULEPARAM_H_
#define _CHECKGENDERONFLIGHTBYCOMPOSITIONFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckGenderOnFlightByCompositionForPRRule;

class CheckGenderOnFlightByCompositionForPRRuleParam : public RuleParam {
	friend class CheckGenderOnFlightByCompositionForPRRule;
private:
	explicit CheckGenderOnFlightByCompositionForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7314;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		PAIRING_BASES = 1,
		FLIGHT_FLEETS = 2,
		ACTING_RANKS = 3,
		FLIGHT_COMPOSITIONS = 4,
		MIN_MALE_CREWS = 5,
		MAX_MALE_CREWS = 6,
		LAYOVER = 7,
		EVEN_DISTRIBUTION = 8,
		EVEN_ON_GENDER = 9,
		INCLUDE_DHD = 10,
	};

	std::vector<std::string> _pairingBases{};
	std::vector<std::string> _flightFleets{};
	std::vector<std::string> _actingRanks{};
	std::vector<std::string> _flightCompositions{};
	std::string _minMalCrews{};
	int _minMalCrewsNumber{};

	std::string _maxMalCrews{};
	int _maxMalCrewsNumber{};

	std::string _layover{};

	std::string _evenDistribution{};

	//平均分配时，所需人数是奇数，则奇数的是F还是M
	std::string _evenOnGender{};

	std::string _includeDHD{};

	// Y/N - 筛选条件。 Y - 满足条件（Acting Ranks）Crew总数是偶数，N - 奇数。支持 * 通配，即忽略该条件 
	std::string _isTotalEven{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, 
	};

	bool MatchPairing(const Pairing* pairing) const;

	bool MatchFleets(const string fleet) const;

	bool MatchComposition(const string composition) const;

	bool MatchActingRank(const string actingRank) const;

	int GetCrewNumberByActingRank(const Segment* s) const;
};

#endif //_CHECKGENDERONFLIGHTBYCOMPOSITIONFORPRRULEPARAM_H_
