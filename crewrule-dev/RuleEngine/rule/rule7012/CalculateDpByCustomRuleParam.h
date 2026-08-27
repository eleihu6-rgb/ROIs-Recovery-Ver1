//#pragma once
//
//#include "CrewDB.h"
//#include "../../violationcollector/ViolationTypeDefine.h"
//#include "../RuleSystemDefine.h"
//#include "../RuleParam.h"
//#include <string>
//#include <limits>
//
//class CalculateDpByCustomRuleParam;
//
//class CalculateDpByCustomRuleParam : public RuleParam {
//	friend class CalculateDpByCustomRule;
//private:
//	explicit CalculateDpByCustomRuleParam(const Rule* rule) :RuleParam(rule) {};
//
//	constexpr static unsigned int RuleFuncId = 7012;
//	constexpr static char delimInParam = ',';
//	constexpr static short totalNumParam = 14;
//
//	enum class ParamLocation {
//		BASES = 0,
//		RANKS = 1,
//		FLEETS = 2,
//		TEAMS = 3,
//		CREW_NATIONALITY = 4,
//		COUNTRIES = 5,
//		QUALS = 6
//	};
//
//	std::vector<std::string> _bases{};
//	std::vector<std::string> _ranks{};
//	std::vector<std::string> _fleets{};
//	std::vector<std::string> _teams{};
//	string _crewNationality{};
//	std::vector<std::string> _countries{};
//	std::vector<std::string> _quals{};
//
//
//	//任务类型,使用“|”分隔，表示多个值
//
//
//	void ParseParam(const DBRule& dbRule);
//
//	//判断机组人员是否满足资质
//	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;
//
//
//};
