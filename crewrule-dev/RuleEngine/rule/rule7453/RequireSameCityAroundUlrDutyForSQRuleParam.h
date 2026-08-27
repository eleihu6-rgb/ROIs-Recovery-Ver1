/**
 * @file RequireSameCityAroundUlrDutyForSQRuleParam.h
 */

#ifndef _REQUIRE_SAME_CITY_AROUND_ULR_DUTY_FOR_SQ_RULE_PARAM_H_
#define _REQUIRE_SAME_CITY_AROUND_ULR_DUTY_FOR_SQ_RULE_PARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"

class RequireSameCityAroundUlrDutyForSQRuleParam : public RuleParam {
public:
    explicit RequireSameCityAroundUlrDutyForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_SAME_CITY_AROUND_ULR_DUTY;

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);

    bool MatchBase(const std::string& base) const;
    bool MatchFleetGroupsForPairing(const Pairing* pairing, const CrewDataContext* dbData) const;
    bool IsActive() const { return _active; }
    int GetRowNum() const { return _rowNum; }
    void SetRowNum(int rowNum) { _rowNum = rowNum; }
    const std::string& GetBaseLabel() const { return _baseLabel; }
    const std::string& GetFleetGroupLabel() const { return _fleetGroupLabel; }

private:
    std::vector<std::string> _bases{};
    std::string _baseLabel{"*"};
    std::vector<std::string> _fleetGroupsUpper{};
    std::string _fleetGroupLabel{"*"};
    bool _active{true};
    int _rowNum{0};

    static std::string NormalizeToken(const std::string& value);
    static bool IsAllToken(const std::string& valueUpper);
    static void ParseListValue(const std::string& value, std::vector<std::string>& output);
    static bool IsHeaderRow(const DBRule& dbRule);
};

#endif // _REQUIRE_SAME_CITY_AROUND_ULR_DUTY_FOR_SQ_RULE_PARAM_H_
