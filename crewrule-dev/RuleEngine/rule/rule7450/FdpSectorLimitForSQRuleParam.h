/**
 * @file FdpSectorLimitForSQRuleParam.h
 */

#ifndef _FDP_SECTOR_LIMIT_FOR_SQ_RULE_PARAM_H_
#define _FDP_SECTOR_LIMIT_FOR_SQ_RULE_PARAM_H_

#include <string>
#include <vector>
#include <limits>

#include "CrewDB.h"
#include "RuleParam.h"

class FdpSectorLimitForSQRuleParam : public RuleParam {
public:
    explicit FdpSectorLimitForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    static constexpr unsigned int RuleFuncId = RULES::SQ_CA_FDP_SECTOR_LIMIT;

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);

    bool Matches(const Duty* duty, const std::string& compositionUpper,
                 int fdpMinutes) const;

    int GetMaxSectors() const { return _maxSectors; }
    int GetRowNum() const { return _rowNum; }
    void SetRowNum(int rowNum) { _rowNum = rowNum; }
    const std::string& GetCompositionLabel() const { return _compositionLabel; }
    int GetFdpLowerMinutes() const { return _fdpLowerMinutes; }
    int GetFdpUpperMinutes() const { return _fdpUpperMinutes; }

    int GetSectorBlhLowerMinutes() const { return _sectorBlhLowerMinutes; }
    int GetSectorBlhUpperMinutes() const { return _sectorBlhUpperMinutes; }
private:
    std::vector<std::string> _compositionsUpper{};
    std::string _compositionLabel{"*"};
    int _fdpLowerMinutes{0};
    int _fdpUpperMinutes{std::numeric_limits<int>::max()};
    int _sectorBlhLowerMinutes{ 0 };
    int _sectorBlhUpperMinutes{ std::numeric_limits<int>::max() };
    int _maxSectors{std::numeric_limits<int>::max()};
    int _rowNum{0};

    void parseListValue(const std::string& value,
                        std::vector<std::string>& target,
                        std::string& label);
    static int parseDurationValue(const std::string& text, int defaultValue);
    static std::string normalizeToken(const std::string& token);
    static int parseIntValue(const std::string& text, int defaultValue);
    void applyHeaderValue(const std::string& headerUpper, const std::string& value);

    bool MatcheSectorBLH(const Duty* duty) const;
};

#endif // _FDP_SECTOR_LIMIT_FOR_SQ_RULE_PARAM_H_
