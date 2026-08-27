//
// Created by Yuhao Wang on 2025/11/28.
//

#ifndef PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEOPTION_H
#define PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEOPTION_H

#include <string>
#include <map>
#include "DutyCode.h"
#include "DutyCodeOptionRow.h"

namespace DutyCode{
    class DutyCodeOption {
    public:
        explicit DutyCodeOption() = default;

        // setters
        void SetName(const std::string& name) { _name = name; }
        void SetDivision(const std::string& division) { _division = division; }
        void SetSegmentComposition(const std::map<std::string, int>& complement) { _segmentComplement = complement; }
        void PushPairingCompositionCount(const std::map<std::string, int>& pairingComposition, int count) {
            _requiredPairingComplementCombination.insert({FormComplementIdentifier(pairingComposition), count});
        }
        void SetDutyCodeOptionRows(std::map<std::string, DutyCodeOptionRow>&& dutyCodeRows) { _dutyCodeRows = std::move(dutyCodeRows); }
        void PushAllRequiredDutyType(const std::set<DutyType>& dutyTypeCombination) {
            _allRequiredDutyTypes.emplace_back(dutyTypeCombination);
        }

        [[nodiscard]] bool CheckIfSegmentComplementMatch(const std::map<std::string, int>& segmentComplement) const {
            return segmentComplement == _segmentComplement;
        }

        [[nodiscard]] bool CheckIfDivisionMatch(const std::string& division) const {
            return _division.empty() || _division == "*" || _division == division;
        }

        [[nodiscard]] bool CheckIfPairingComplementMatchRows(const std::vector<const Pairing*>& pairings) const {
            std::map<std::string, int> remainingComplement = _requiredPairingComplementCombination;

            for (const auto& pairing: pairings) {
                auto it = remainingComplement.find(FormComplementIdentifier(pairing->GetComplements()));
                if (it == remainingComplement.end()) {
                    // out of configuration complement detected, doesn't match
                    return false;
                }
                --it->second;
                if (it->second < 0) {
                    // over extract complement setting in configuration, doesn't match
                    return false;
                }
            }
            // check if all the complement has been successfully selected
            for (const auto& [_, value]: remainingComplement) {
                if (value != 0) return false;
            }

            return true;
        }
        [[nodiscard]] const std::string& GetName() const { return _name; }
        [[nodiscard]] const std::vector<std::set<DutyType>>& GetAllRequiredDutyTypes() const { return _allRequiredDutyTypes; }
        [[nodiscard]] const DutyCodeOptionRow* GetDutyCodeRow(const std::map<std::string, int>& pairingComplement) const {
            const auto cit = _dutyCodeRows.find(FormComplementIdentifier(pairingComplement));
            if (cit == _dutyCodeRows.end()) return nullptr;
            return &cit->second;
        }

        static std::string FormComplementIdentifier(const std::map<std::string, int>& complement) {
            std::string result;
            constexpr char RankDelim = ';';
            for (const auto& [rank, value]: complement) {
                if (value >= 1) {
                    constexpr char RankValueDelim = ':';
                    result.append(rank);
                    result.push_back(RankValueDelim);
                    result.append(std::to_string(value));
                    result.push_back(RankDelim);
                }
            }
            if (result.empty()) {
                // complement is empty, return empty
                return "Empty";
            }
            while (result.back() == RankDelim) {
                result.pop_back();
            }
            return result;
        }

    private:
        std::string _name;
        std::string _division;
        std::map<std::string, int> _segmentComplement;
        std::vector<std::set<DutyType>> _allRequiredDutyTypes;
        std::map<std::string, int> _requiredPairingComplementCombination;
        std::map<std::string, DutyCodeOptionRow> _dutyCodeRows;
    };
}



#endif //PairingOptimizeProject_PAIRINGOPTIMIZEPROJECT_DUTYCODEOPTION_H
