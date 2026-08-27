//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONCOMPLEMENT_H
#define TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONCOMPLEMENT_H

#include "string"

class DBTrainingPairingSeparationComplement {
public:
    DBTrainingPairingSeparationComplement(long long separatedPairingId, const std::string &rank, unsigned int value)
            : _separatedPairingId(separatedPairingId), _rank(rank), _value(value) {}

    const long long GetSeparatedPairingId() const { return _separatedPairingId; }

    void SetSeparatedPairingId(long long separatedPairingId) { _separatedPairingId = separatedPairingId; }

    const std::string &GetRank() const { return _rank; }

    void SetRank(const std::string &rank) { _rank = rank; }

    const unsigned int GetValue() const { return _value; }

    void SetValue(unsigned int value) { _value = value; }

private:
    long long _separatedPairingId;
    std::string _rank;
    unsigned int _value;
};


#endif //TRAININGOPTIMIZER_DBTRAININGPAIRINGSEPARATIONCOMPLEMENT_H
